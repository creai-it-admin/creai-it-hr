import type { Metadata } from "next";
import { Compare } from "../_components/compare";

export const metadata: Metadata = { title: "후보 비교" };

export default function Page() {
  return <Compare />;
}
