import { SignInForm } from "@/components/sign-in-form";

export const metadata = { title: "Sign in · Prem Predict" };

export default function SignInPage() {
  return <div className="page-shell account-page">
    <header className="page-head">
      <p className="page-eyebrow">Your Prem Predict</p>
      <h1 className="page-title">Your lineups. Ready when you are.</h1>
      <p className="page-lede">Sign in to keep your scenarios together, reopen them on another device, and make the next call your own.</p>
    </header>
    <SignInForm />
  </div>;
}
