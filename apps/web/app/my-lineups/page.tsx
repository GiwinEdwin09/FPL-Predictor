import { SavedLineups } from "@/components/saved-lineups";

export const metadata = { title: "My lineups · Prem Predict" };

export default function MyLineupsPage() {
  return <div className="page-shell"><header className="page-head"><p className="page-eyebrow">Your Prem Predict</p><h1 className="page-title">My lineups</h1><p className="page-lede">Your ideas, saved privately. Reopen a scenario, give it a new name, or keep it in your archive.</p></header><SavedLineups /></div>;
}
