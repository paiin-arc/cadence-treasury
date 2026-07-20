import type { FC } from "react";

export interface ChainMetadata {
  name: string;
  value: string;
  chainId: number;
  cctpDomain: number;
  nativeUsdc: boolean;
  cctpStatus: "active" | "testnet" | "planned";
  explorer: string;
  Logo: FC<{ className?: string; size?: number }>;
}

export const ARC_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#F97316" />
    <path d="M16 7L24 23H19.5L16 15.5L12.5 23H8L16 7Z" fill="#09090B" />
    <path d="M13.5 18H18.5L16 13L13.5 18Z" fill="#F97316" />
  </svg>
);

export const ETHEREUM_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#627EEA" />
    <path d="M16 4L15.7 5V20.1L16 20.4L23.5 16L16 4Z" fill="#FFFFFF" fillOpacity="0.6" />
    <path d="M16 4L8.5 16L16 20.4V5V4Z" fill="#FFFFFF" />
    <path d="M16 21.8L15.8 22V27.7L16 28L23.5 17.5L16 21.8Z" fill="#FFFFFF" fillOpacity="0.6" />
    <path d="M16 28V21.8L8.5 17.5L16 28Z" fill="#FFFFFF" />
  </svg>
);

export const BASE_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#0052FF" />
    <path d="M16 6C10.4772 6 6 10.4772 6 16C6 21.5228 10.4772 26 16 26C21.5228 26 26 21.5228 26 16C26 10.4772 21.5228 6 16 6ZM16 21C13.2386 21 11 18.7614 11 16C11 13.2386 13.2386 11 16 11C18.7614 11 21 13.2386 21 16C21 18.7614 18.7614 21 16 21Z" fill="white" />
  </svg>
);

export const AVALANCHE_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#E84142" />
    <path d="M11.8 19.5L7.5 27H11.5L14 22.5L11.8 19.5ZM16 6L8.8 18.5H12.8L16 13L19.2 18.5H23.2L16 6ZM20.2 19.5L18 22.5L20.5 27H24.5L20.2 19.5Z" fill="white" />
  </svg>
);

export const POLYGON_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#8247E5" />
    <path d="M22.5 12.5L17.5 9.6C16.6 9.1 15.4 9.1 14.5 9.6L9.5 12.5C8.6 13 8 14 8 15.1V20.9C8 22 8.6 23 9.5 23.5L14.5 26.4C15.4 26.9 16.6 26.9 17.5 26.4L22.5 23.5C23.4 23 24 22 24 20.9V15.1C24 14 23.4 13 22.5 12.5Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none" />
  </svg>
);

export const CHAIN_METADATA_MAP: Record<string, ChainMetadata> = {
  Arc_Testnet: {
    name: "Arc Testnet",
    value: "Arc_Testnet",
    chainId: 5042002,
    cctpDomain: 7,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://testnet.arcscan.app",
    Logo: ARC_LOGO,
  },
  Base_Sepolia: {
    name: "Base Sepolia",
    value: "Base_Sepolia",
    chainId: 84532,
    cctpDomain: 6,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://sepolia.basescan.org",
    Logo: BASE_LOGO,
  },
  Ethereum_Sepolia: {
    name: "Ethereum Sepolia",
    value: "Ethereum_Sepolia",
    chainId: 11155111,
    cctpDomain: 0,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://sepolia.etherscan.io",
    Logo: ETHEREUM_LOGO,
  },
  Avalanche_Fuji: {
    name: "Avalanche Fuji",
    value: "Avalanche_Fuji",
    chainId: 43113,
    cctpDomain: 1,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://testnet.snowtrace.io",
    Logo: AVALANCHE_LOGO,
  },
  Polygon_Amoy_Testnet: {
    name: "Polygon Amoy",
    value: "Polygon_Amoy_Testnet",
    chainId: 80002,
    cctpDomain: 7,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://amoy.polygonscan.com",
    Logo: POLYGON_LOGO,
  },
};
