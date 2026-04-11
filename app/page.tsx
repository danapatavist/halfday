"use client";
import dynamic from "next/dynamic";
import { useIsMobile } from "./hooks/useIsMobile";

const PubMap = dynamic(() => import("./components/PubMap"), { ssr: false });
const MobileApp = dynamic(() => import("./components/MobileApp"), { ssr: false });

export default function Home() {
  const isMobile = useIsMobile();
  if (isMobile === null) return null; // waiting for client detection
  return isMobile ? <MobileApp /> : <PubMap />;
}
