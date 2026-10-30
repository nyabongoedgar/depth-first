import { useEffect, useState } from 'preact/hooks';
import type { Course, CourseId } from '../core/types';
import { COURSE_IDS, loadCourse } from '../content/index';

const cache = new Map<CourseId, Promise<Course>>();
export function getCourse(id: CourseId): Promise<Course> {
  if (!cache.has(id)) cache.set(id, loadCourse(id));
  return cache.get(id)!;
}

export function useCourse(id: CourseId | undefined) {
  const [course, setCourse] = useState<Course | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setCourse(undefined);
    setError(undefined);
    if (!id) return;
    let live = true;
    getCourse(id).then((c) => live && setCourse(c), (e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [id]);
  return { course, error };
}

export function useAllCourses() {
  const [courses, setCourses] = useState<Course[] | undefined>();
  useEffect(() => {
    let live = true;
    Promise.all(COURSE_IDS.map(getCourse)).then((c) => live && setCourses(c));
    return () => {
      live = false;
    };
  }, []);
  return courses;
}
