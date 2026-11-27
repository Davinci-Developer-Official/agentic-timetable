import { getRuntime } from "@/lib/runtime";
import TimetableWorkspace from "@/components/TimetableWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function HomePage() {
  const { store } = getRuntime();
  const initialStats = store.getStats();
  const initialCourses = store.listCourses();
  const defaultCourse = initialCourses[0]?.course || "";
  const initialSlots = defaultCourse
    ? store.searchSlots({ course: defaultCourse })
    : [];

  return (
    <TimetableWorkspace
      initialStats={initialStats}
      initialCourses={initialCourses}
      initialDefaultCourse={defaultCourse}
      initialSlots={initialSlots}
    />
  );
}
