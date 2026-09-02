import { Suspense } from "react";
import { RobotVoice } from "@/components/RobotVoice";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <RobotVoiceLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function RobotVoiceLoader({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const params = await searchParams;
  const debug = params?.debug === "true";
  return <RobotVoice debug={debug} />;
}
