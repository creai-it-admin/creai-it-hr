import type { Metadata } from "next";
import { OriginalFrame } from "../../../_components/demo-frames";

export const metadata: Metadata = { title: "원문 예시" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OriginalFrame refId={id} />;
}
