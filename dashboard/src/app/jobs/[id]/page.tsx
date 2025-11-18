import JobClient from "./JobClient";

export default function Page({ params }: { params: { id: string } }) {
  return <JobClient id={params.id} />;
}