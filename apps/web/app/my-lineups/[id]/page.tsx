import { SavedLineupDetail } from "@/components/saved-lineup-detail";

export default async function SavedLineupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="page-shell"><SavedLineupDetail id={id} /></div>;
}
