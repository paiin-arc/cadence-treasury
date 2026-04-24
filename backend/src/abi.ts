export const TREASURY_ABI = [
  {
    name: "userBalances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTotalBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getAiCap",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getPayment",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "paymentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "frequency", type: "uint64" },
          { name: "nextExecTime", type: "uint64" },
          { name: "active", type: "bool" },
          { name: "requiresApproval", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "nextPaymentId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "executePayment",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "uint256" },
      { name: "ogProofHash", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "PaymentExecuted",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "executedBy", type: "address", indexed: false },
    ],
  },
  {
    name: "PaymentScheduled",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "frequency", type: "uint64", indexed: false },
    ],
  },
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "AuditLog",
    type: "event",
    inputs: [
      { name: "paymentId", type: "uint256", indexed: true },
      { name: "ogProofHash", type: "string", indexed: false },
      { name: "executedBy", type: "address", indexed: false },
    ],
  },
] as const;
