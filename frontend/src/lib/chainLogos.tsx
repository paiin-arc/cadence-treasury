import type { FC } from "react";
import arcLogoUrl from "../assets/arc.png";
import arbLogoUrl from "../assets/arb.png";
import ethLogoUrl from "../assets/eth.png";
import avaxLogoUrl from "../assets/avax.png";
import usdcLogoUrl from "../assets/usdc.png";

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

export const USDC_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <img
    src={usdcLogoUrl}
    alt="USDC"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%", objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
  />
);

export const ARC_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <img
    src={arcLogoUrl}
    alt="Arc"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%", objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
  />
);

export const ETHEREUM_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <img
    src={ethLogoUrl}
    alt="Ethereum"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%", objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
  />
);

export const BASE_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <circle cx="16" cy="16" r="16" fill="#0052FF" />
    <path d="M16 6C10.4772 6 6 10.4772 6 16C6 21.5228 10.4772 26 16 26C21.5228 26 26 21.5228 26 16C26 10.4772 21.5228 6 16 6ZM16 21C13.2386 21 11 18.7614 11 16C11 13.2386 13.2386 11 16 11C18.7614 11 21 13.2386 21 16C21 18.7614 18.7614 21 16 21Z" fill="white" />
  </svg>
);

export const ARBITRUM_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <img
    src={arbLogoUrl}
    alt="Arbitrum"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%", objectFit: "cover", display: "inline-block", verticalAlign: "middle" }}
  />
);

export const AVALANCHE_LOGO: FC<{ className?: string; size?: number }> = ({ className = "", size = 20 }) => (
  <img
    src={avaxLogoUrl}
    alt="Avalanche"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%", objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
  />
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
  Arbitrum_Sepolia: {
    name: "Arbitrum Sepolia",
    value: "Arbitrum_Sepolia",
    chainId: 421614,
    cctpDomain: 3,
    nativeUsdc: true,
    cctpStatus: "active",
    explorer: "https://sepolia.arbiscan.io",
    Logo: ARBITRUM_LOGO,
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

