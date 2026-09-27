import type { Metadata } from "next";
import { Explore } from "../_components/explore";

export const metadata: Metadata = { title: "기회 찾기" };

export default function Page() {
  return <Explore />;
}
