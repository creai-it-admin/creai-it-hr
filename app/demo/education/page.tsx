import type { Metadata } from "next";
import { Suspense } from "react";
import { EducationFrame } from "../../_components/demo-frames";

export const metadata: Metadata = { title: "교육 소개 예시" };

export default function Page() {
  return (
    <Suspense>
      <EducationFrame />
    </Suspense>
  );
}
