import { AccountSettings } from "@/components/account-settings";

export const metadata = { title: "Account · Prem Predict" };

export default function AccountPage() {
  return <div className="page-shell account-page">
    <header className="page-head">
      <p className="page-eyebrow">Your Prem Predict</p>
      <h1 className="page-title">Account</h1>
      <p className="page-lede">Your sign-in details, display name and sessions.</p>
    </header>
    <AccountSettings />
  </div>;
}
