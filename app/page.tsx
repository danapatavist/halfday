"use client";
import dynamic from "next/dynamic";

const PubMap = dynamic(() => import("./components/PubMap"), { ssr: false });

export default function Home() {
  return <PubMap />;
}
