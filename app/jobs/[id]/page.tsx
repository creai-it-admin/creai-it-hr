import type { Metadata } from "next";
import { JobDetail } from "../../_components/detail";

export const metadata: Metadata = { title: "공고 상세" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
