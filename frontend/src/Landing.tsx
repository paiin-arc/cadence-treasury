import WalletGate from "./components/WalletGate";

export default function Landing() {
  const handleUnlock = () => {
    window.location.hash = "#dashboard";
  };

  return <WalletGate onUnlock={handleUnlock} />;
}
