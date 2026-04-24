// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title USDCTreasury
 * @notice USDC treasury with recurring payments and AI agent integration
 * @dev Deployed on Arc Testnet. USDC address: 0x3600000000000000000000000000000000000000
 */
contract USDCTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant AI_EXECUTOR_ROLE = keccak256("AI_EXECUTOR_ROLE");
    bytes32 public constant SCHEDULER_ROLE   = keccak256("SCHEDULER_ROLE");

    IERC20 public immutable usdc;

    mapping(address => uint256) public userBalances;
    mapping(address => bool) public allowlisted;

    struct Payment {
        address owner;
        address recipient;
        uint256 amount;
        uint64  frequency;
        uint64  nextExecTime;
        bool    active;
        bool    requiresApproval;
    }

    mapping(uint256 => Payment) public payments;
    uint256 public nextPaymentId;

    uint256 public maxSingleTx = 10_000 * 1e6;
    uint256 public aiCapBps    = 500;
    uint256 public minBalance  = 100 * 1e6;
    bool    public paused;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PaymentScheduled(uint256 indexed paymentId, address indexed owner, address indexed recipient, uint256 amount, uint64 frequency);
    event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy);
    event PaymentCancelled(uint256 indexed paymentId);
    event AllowlistUpdated(address indexed recipient, bool status);
    event AiCapUpdated(uint256 newCapBps);
    event EmergencyPause(bool paused);
    event AuditLog(uint256 indexed paymentId, string ogProofHash, address executedBy);

    modifier whenNotPaused() {
        require(!paused, "Treasury: paused");
        _;
    }

    modifier withinAiCap(uint256 amount) {
        uint256 totalBalance = usdc.balanceOf(address(this));
        uint256 cap = (totalBalance * aiCapBps) / 10_000;
        require(amount <= cap, "Treasury: exceeds AI cap");
        _;
    }

    constructor(address _usdc, address _admin) {
        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SCHEDULER_ROLE, _admin);
    }

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Treasury: zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        userBalances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        require(userBalances[msg.sender] >= amount, "Treasury: insufficient balance");
        uint256 contractBalance = usdc.balanceOf(address(this));
        require(contractBalance - amount >= minBalance, "Treasury: would breach minimum");
        userBalances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function schedulePayment(
        address recipient,
        uint256 amount,
        uint64  frequency,
        uint64  delaySeconds
    ) external whenNotPaused returns (uint256 paymentId) {
        require(allowlisted[recipient], "Treasury: recipient not allowlisted");
        require(amount > 0 && amount <= maxSingleTx, "Treasury: invalid amount");
        require(userBalances[msg.sender] >= amount, "Treasury: insufficient balance");

        paymentId = nextPaymentId++;
        payments[paymentId] = Payment({
            owner:            msg.sender,
            recipient:        recipient,
            amount:           amount,
            frequency:        frequency,
            nextExecTime:     uint64(block.timestamp) + delaySeconds,
            active:           true,
            requiresApproval: amount >= (maxSingleTx / 2)
        });

        emit PaymentScheduled(paymentId, msg.sender, recipient, amount, frequency);
    }

    function executePayment(
        uint256 paymentId,
        string calldata ogProofHash
    ) external whenNotPaused nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.active, "Treasury: payment not active");
        require(block.timestamp >= p.nextExecTime, "Treasury: too early");
        require(allowlisted[p.recipient], "Treasury: recipient removed from allowlist");

        if (hasRole(AI_EXECUTOR_ROLE, msg.sender)) {
            uint256 totalBalance = usdc.balanceOf(address(this));
            uint256 cap = (totalBalance * aiCapBps) / 10_000;
            require(p.amount <= cap, "Treasury: AI cap exceeded");
        } else {
            require(
                hasRole(SCHEDULER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
                "Treasury: unauthorized"
            );
        }

        require(userBalances[p.owner] >= p.amount, "Treasury: owner insufficient balance");

        userBalances[p.owner] -= p.amount;

        if (p.frequency == 0) {
            p.active = false;
        } else {
            p.nextExecTime = uint64(block.timestamp) + p.frequency;
        }

        usdc.safeTransfer(p.recipient, p.amount);

        emit PaymentExecuted(paymentId, p.recipient, p.amount, msg.sender);

        if (bytes(ogProofHash).length > 0) {
            emit AuditLog(paymentId, ogProofHash, msg.sender);
        }
    }

    function cancelPayment(uint256 paymentId) external {
        Payment storage p = payments[paymentId];
        require(p.owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Treasury: unauthorized");
        p.active = false;
        emit PaymentCancelled(paymentId);
    }

    function setAllowlist(address recipient, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowlisted[recipient] = status;
        emit AllowlistUpdated(recipient, status);
    }

    function setAllowlistBatch(address[] calldata recipients, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < recipients.length; i++) {
            allowlisted[recipients[i]] = status;
            emit AllowlistUpdated(recipients[i], status);
        }
    }

    function setAiCap(uint256 newCapBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCapBps <= 1000, "Treasury: cap max 10%");
        aiCapBps = newCapBps;
        emit AiCapUpdated(newCapBps);
    }

    function setMaxSingleTx(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxSingleTx = newMax;
    }

    function setMinBalance(uint256 newMin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minBalance = newMin;
    }

    function setPaused(bool _paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    function revokeAiRole(address aiExecutor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(AI_EXECUTOR_ROLE, aiExecutor);
    }

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function getTotalBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getAiCap() external view returns (uint256) {
        return (usdc.balanceOf(address(this)) * aiCapBps) / 10_000;
    }

    function isDue(uint256 paymentId) external view returns (bool) {
        Payment memory p = payments[paymentId];
        return p.active && block.timestamp >= p.nextExecTime;
    }
}
