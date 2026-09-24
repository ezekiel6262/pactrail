// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Reference-only milestone escrow. Not audited; do not use with real funds.
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract PactrailEscrow {
    enum State { Created, Funded, Completed, Cancelled }

    struct Milestone {
        uint256 amount;
        bool released;
    }

    address public immutable payer;
    address public immutable recipient;
    address public immutable resolver;
    IERC20Minimal public immutable asset;
    bytes32 public immutable policyHash;
    State public state;
    Milestone[] public milestones;

    event Funded(uint256 total);
    event MilestoneReleased(uint256 indexed index, uint256 amount);
    event Cancelled(uint256 refund);

    modifier onlyPayer() { require(msg.sender == payer, "payer only"); _; }
    modifier onlyResolverOrPayer() { require(msg.sender == payer || msg.sender == resolver, "not authorized"); _; }

    constructor(address _payer, address _recipient, address _resolver, address _asset, bytes32 _policyHash, uint256[] memory amounts) {
        require(_payer != address(0) && _recipient != address(0) && _asset != address(0), "zero address");
        require(amounts.length > 0, "no milestones");
        payer = _payer; recipient = _recipient; resolver = _resolver; asset = IERC20Minimal(_asset); policyHash = _policyHash;
        for (uint256 i; i < amounts.length; i++) { require(amounts[i] > 0, "zero milestone"); milestones.push(Milestone(amounts[i], false)); }
    }

    function fund() external onlyPayer {
        require(state == State.Created, "wrong state");
        uint256 total; for (uint256 i; i < milestones.length; i++) total += milestones[i].amount;
        require(asset.transferFrom(payer, address(this), total), "funding failed"); state = State.Funded; emit Funded(total);
    }

    function release(uint256 index) external onlyPayer {
        require(state == State.Funded && index < milestones.length, "invalid release");
        Milestone storage item = milestones[index]; require(!item.released, "already released");
        item.released = true; require(asset.transfer(recipient, item.amount), "transfer failed"); emit MilestoneReleased(index, item.amount);
        bool complete = true; for (uint256 i; i < milestones.length; i++) if (!milestones[i].released) complete = false;
        if (complete) state = State.Completed;
    }

    function cancel() external onlyResolverOrPayer {
        require(state == State.Funded, "wrong state"); state = State.Cancelled;
        uint256 refund; for (uint256 i; i < milestones.length; i++) if (!milestones[i].released) refund += milestones[i].amount;
        require(asset.transfer(payer, refund), "refund failed"); emit Cancelled(refund);
    }
}
