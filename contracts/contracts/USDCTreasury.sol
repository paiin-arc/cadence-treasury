// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title USDCTreasury
 * @notice Permissionless USDC treasury with scheduled, recurring and batch payments on Arc.
 * @dev Each depositor controls their own balance and can pay any address.
 */
contract USDCTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SCHEDULER_ROLE = keccak256("SCHEDULER_ROLE");

    IERC20 public immutable usdc;

    mapping(address => uint256) public userBalances;

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
    uint256 public minBalance  = 0;
    bool    public paused;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PaymentScheduled(uint256 indexed paymentId, address indexed owner, address indexed recipient, uint256 amount, uint64 frequency);
    event PaymentExecuted(uint256 indexed paymentId, address indexed recipient, uint256 amount, address executedBy);
    event PaymentCancelled(uint256 indexed paymentId);
    event EmergencyPause(bool paused);

    modifier whenNotPaused() {
        require(!paused, "Treasury: paused");
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
        require(recipient != address(0), "Treasury: zero recipient");
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

    /// @notice Schedule N payments in one tx (e.g. salary to multiple wallets at once).
    /// All four arrays must be the same length.
    function schedulePaymentBatch(
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint64[]  calldata frequencies,
        uint64[]  calldata delaysSeconds
    ) external whenNotPaused returns (uint256[] memory paymentIds) {
        uint256 len = recipients.length;
        require(len > 0, "Treasury: empty batch");
        require(amounts.length == len && frequencies.length == len && delaysSeconds.length == len,
            "Treasury: array length mismatch");

        uint256 senderBalance = userBalances[msg.sender];
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < len; i++) {
            require(recipients[i] != address(0), "Treasury: zero recipient");
            require(amounts[i] > 0 && amounts[i] <= maxSingleTx, "Treasury: invalid amount");
            totalAmount += amounts[i];
        }
        require(senderBalance >= totalAmount, "Treasury: insufficient balance for batch");

        paymentIds = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 paymentId = nextPaymentId++;
            payments[paymentId] = Payment({
                owner:            msg.sender,
                recipient:        recipients[i],
                amount:           amounts[i],
                frequency:        frequencies[i],
                nextExecTime:     uint64(block.timestamp) + delaysSeconds[i],
                active:           true,
                requiresApproval: amounts[i] >= (maxSingleTx / 2)
            });
            paymentIds[i] = paymentId;
            emit PaymentScheduled(paymentId, msg.sender, recipients[i], amounts[i], frequencies[i]);
        }
    }

    function executePayment(uint256 paymentId) external whenNotPaused nonReentrant {
        Payment storage p = payments[paymentId];
        require(p.active, "Treasury: payment not active");
        require(block.timestamp >= p.nextExecTime, "Treasury: too early");
        require(
            hasRole(SCHEDULER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Treasury: unauthorized"
        );
        require(userBalances[p.owner] >= p.amount, "Treasury: owner insufficient balance");

        userBalances[p.owner] -= p.amount;

        if (p.frequency == 0) {
            p.active = false;
        } else {
            p.nextExecTime = uint64(block.timestamp) + p.frequency;
        }

        usdc.safeTransfer(p.recipient, p.amount);

        emit PaymentExecuted(paymentId, p.recipient, p.amount, msg.sender);
    }

    function cancelPayment(uint256 paymentId) external {
        Payment storage p = payments[paymentId];
        require(p.owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Treasury: unauthorized");
        p.active = false;
        emit PaymentCancelled(paymentId);
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

    function getPayment(uint256 paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function getTotalBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function isDue(uint256 paymentId) external view returns (bool) {
        Payment memory p = payments[paymentId];
        return p.active && block.timestamp >= p.nextExecTime;
    }
}
