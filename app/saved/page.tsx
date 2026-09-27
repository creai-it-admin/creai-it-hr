import type { Metadata } from "next";
import { Saved } from "../_components/saved";

export const metadata: Metadata = { title: "저장한 공고" };

export default function Page() {
  return <Saved />;
}
