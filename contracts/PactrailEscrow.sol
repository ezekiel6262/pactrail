// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Milestone escrow for Pactrail policies. Testnet beta; not independently audited.
contract PactrailEscrow {
    enum State { Created, Funded, Disputed, Completed, Cancelled }

    struct Milestone { uint256 amount; bool released; }

    address public immutable payer;
    address public immutable recipient;
    address public immutable resolver;
    IERC20Minimal public immutable asset;
    bytes32 public immutable policyHash;
    uint256 public immutable totalAmount;
    uint256 public immutable expiresAt;
    uint256 public releasedAmount;
    State public state;
    Milestone[] public milestones;
    uint256 private locked = 1;

    event Funded(address indexed payer, uint256 total);
    event DisputeRaised(address indexed by);
    event MilestoneReleased(uint256 indexed index, uint256 amount, address indexed by);
    event Cancelled(uint256 refund, address indexed by);
    event Completed(uint256 totalReleased);

    error Unauthorized();
    error InvalidState();
    error InvalidConfiguration();
    error TransferFailed();
    error ReentrantCall();
    error NotExpired();

    modifier nonReentrant() { if (locked != 1) revert ReentrantCall(); locked = 2; _; locked = 1; }
    modifier onlyPayer() { if (msg.sender != payer) revert Unauthorized(); _; }

    constructor(address _payer, address _recipient, address _resolver, address _asset, bytes32 _policyHash, uint256[] memory amounts, uint256 _expiresAt) {
        if (_payer == address(0) || _recipient == address(0) || _resolver == address(0) || _asset == address(0) || _payer == _recipient || _resolver == _payer || _resolver == _recipient || amounts.length == 0 || amounts.length > 20 || _expiresAt <= block.timestamp) revert InvalidConfiguration();
        payer = _payer; recipient = _recipient; resolver = _resolver; asset = IERC20Minimal(_asset); policyHash = _policyHash; expiresAt = _expiresAt;
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) { if (amounts[i] == 0) revert InvalidConfiguration(); total += amounts[i]; milestones.push(Milestone(amounts[i], false)); }
        totalAmount = total;
    }

    function milestoneCount() external view returns (uint256) { return milestones.length; }

    function fund() external onlyPayer nonReentrant {
        if (state != State.Created) revert InvalidState();
        uint256 beforeBalance = asset.balanceOf(address(this));
        _safeTransferFrom(payer, address(this), totalAmount);
        if (asset.balanceOf(address(this)) - beforeBalance != totalAmount) revert TransferFailed();
        state = State.Funded;
        emit Funded(payer, totalAmount);
    }

    function raiseDispute() external {
        if (msg.sender != payer && msg.sender != recipient) revert Unauthorized();
        if (state != State.Funded) revert InvalidState();
        state = State.Disputed;
        emit DisputeRaised(msg.sender);
    }

    function release(uint256 index) external nonReentrant {
        if (state != State.Funded && state != State.Disputed) revert InvalidState();
        if (msg.sender != payer && !(state == State.Disputed && msg.sender == resolver)) revert Unauthorized();
        if (index >= milestones.length || milestones[index].released) revert InvalidState();
        Milestone storage milestone = milestones[index];
        milestone.released = true;
        releasedAmount += milestone.amount;
        _safeTransfer(recipient, milestone.amount);
        emit MilestoneReleased(index, milestone.amount, msg.sender);
        if (releasedAmount == totalAmount) { state = State.Completed; emit Completed(releasedAmount); }
    }

    function cancel() external nonReentrant {
        if (state == State.Created) {
            if (msg.sender != payer) revert Unauthorized();
            state = State.Cancelled;
            emit Cancelled(0, msg.sender);
            return;
        }
        if (state != State.Funded && state != State.Disputed) revert InvalidState();
        bool resolverDecision = state == State.Disputed && msg.sender == resolver;
        bool expiredRefund = block.timestamp >= expiresAt && msg.sender == payer;
        if (!resolverDecision && !expiredRefund) {
            if (block.timestamp < expiresAt) revert NotExpired();
            revert Unauthorized();
        }
        state = State.Cancelled;
        uint256 refund = totalAmount - releasedAmount;
        if (refund > 0) _safeTransfer(payer, refund);
        emit Cancelled(refund, msg.sender);
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(asset).call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(asset).call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}

contract PactrailEscrowFactory {
    address[] public escrows;
    event EscrowCreated(address indexed escrow, address indexed payer, address indexed recipient, bytes32 policyHash);

    function createEscrow(address recipient, address resolver, address asset, bytes32 policyHash, uint256[] calldata amounts, uint256 expiresAt) external returns (address escrow) {
        escrow = address(new PactrailEscrow(msg.sender, recipient, resolver, asset, policyHash, amounts, expiresAt));
        escrows.push(escrow);
        emit EscrowCreated(escrow, msg.sender, recipient, policyHash);
    }

    function escrowCount() external view returns (uint256) { return escrows.length; }
}
