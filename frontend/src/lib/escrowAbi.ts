export const ESCROW_ABI = [
  // Reads
  {
    name: "payments",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "releaseTimestamp", type: "uint256" },
      { name: "refundTo", type: "address" },
      { name: "withdrawnAmount", type: "uint256" },
      { name: "refunded", type: "bool" },
    ],
  },
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nonce",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "arbiter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "fiatToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },

  // Writes
  {
    name: "pay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "refundTo", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentIDs", type: "uint256[]" }],
    outputs: [],
  },
  {
    name: "refundByRecipient",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentID", type: "uint256" }],
    outputs: [],
  },
  {
    name: "refundByArbiter",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentID", type: "uint256" }],
    outputs: [],
  },

  // Events
  {
    name: "PaymentCreated",
    type: "event",
    inputs: [
      { name: "paymentID", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "releaseTimestamp", type: "uint256", indexed: false },
      { name: "refundTo", type: "address", indexed: true },
    ],
  },
  {
    name: "Refund",
    type: "event",
    inputs: [
      { name: "paymentID", type: "uint256", indexed: true },
      { name: "refundTo", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Withdrawal",
    type: "event",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
