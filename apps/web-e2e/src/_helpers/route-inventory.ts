import type { Page } from '@playwright/test';

import { stubJson, type RouteRole } from './route-stubs';

export interface RouteFixture {
  /** Human label used as the test title. */
  name: string;
  /** Path to navigate to. */
  path: string;
  /** Role to stub for GET /api/auth/me. */
  role: RouteRole;
  /** Stub the page's data calls. Register broad globs BEFORE specific paths. */
  stubs?: (page: Page) => Promise<void>;
  /** A selector that must be visible before scanning, so axe sees settled DOM. */
  readySelector?: string;
  /**
   * Text that must be visible before scanning — proof the route rendered
   * its REAL content rather than an error/empty state (a stubbed page can
   * "settle" on an error paragraph just as fast as on real data, and that
   * paragraph still matches `readySelector`). Required whenever `stubs` is
   * set: fixture-shape bugs (wrong field name, missing required field) throw
   * inside the component and never satisfy this expectation, failing the
   * test instead of silently scanning three lines of chrome.
   */
  expectText?: string;
  /**
   * Use `toBeAttached()` instead of `toBeVisible()` for `expectText`. Only
   * for content Playwright never reports as visible even when correctly
   * rendered — namely `<option>` text inside a closed `<select>`. Still a
   * real DOM-presence check (a fixture-shape bug throws before the option
   * renders at all), just not a visibility one.
   */
  expectAttached?: boolean;
}

export const NOW = '2026-08-01T00:00:00.000Z';

// Shape verified against CourseCategoryDoc, libs/shared-data-models/src/lib/category.ts:8-13
// — createdAt/updatedAt are required fields (unused by any consuming
// template today, but included so this fixture holds the full contract).
export const FIRST_CATEGORY = { id: 'design', name: 'Design', createdAt: NOW, updatedAt: NOW };

export const CATEGORIES = [
  FIRST_CATEGORY,
  { id: 'engineering', name: 'Engineering', createdAt: NOW, updatedAt: NOW },
];

// Shape verified against CourseSummary, libs/shared-data-models/src/lib/catalog.ts:11-21.
// instructorDisplayName (not instructorName) — course-card.component.html:16,23 reads it.
export const COURSE_CARD = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  instructorId: 'a11y-instructor',
  instructorDisplayName: 'Ingrid Instructor',
  publishedAt: NOW,
};

// Shape verified against CourseCatalogPage, catalog.ts:24-30 — `items`, not
// `courses`; `totalPages` required (catalog-page.component.html:17,32 reads
// result()!.items.length and result()!.totalPages).
export const CATALOG_LIST = {
  items: [COURSE_CARD],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

// Shape verified against CourseCatalogDetail, catalog.ts:46-61 — modules is
// required (course-detail-page.component.html:77 binds it straight into
// ModuleOutlineComponent, which does `modules().length` — undefined throws).
const FIRST_LESSON_TITLE = 'Welcome to Wren';

export const COURSE_DETAIL = {
  ...COURSE_CARD,
  instructorBiography: 'Teaches things.',
  lessonCount: 2,
  modules: [
    {
      title: 'Getting started',
      lessons: [{ id: 'lesson-1', title: FIRST_LESSON_TITLE }],
    },
  ],
};

// Shape verified against ProfileView, libs/shared-data-models/src/lib/profile.ts:6-14 —
// `emailVerified` is required (brief's fixture omitted it); there is no
// `completedCourses` field on ProfileView (that section is populated by a
// separate GET /api/enrollments call — see PROFILE_ENROLLMENTS below).
export const PROFILE = {
  uid: 'a11y-student',
  email: 'student@example.com',
  displayName: 'Sam Student',
  biography: 'Learning things.',
  role: 'STUDENT',
  emailVerified: true,
};

// Shape verified against EnrollmentStatusView, libs/shared-data-models/src/lib/enrollment.ts:36-39
// — GET /api/enrollments/:courseId returns 200 with `enrollment: null` for a
// signed-in caller who is not enrolled, never a 404. CourseEnrollmentPanelComponent
// (libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.ts:90-92)
// treats any request failure as a LOAD_ERROR state (renders "Couldn't load
// enrollment status." + Retry), so stubbing a 404 here would never reach the
// "Enroll" button the keyboard journey needs.
export const ENROLLMENT_STATUS_NONE = { enrollment: null, isOwner: false };

// CompletedCoursesComponent (libs/web-profile/src/lib/completed-courses/completed-courses.component.ts:24)
// calls EnrollmentService.listMyEnrollments() -> GET /api/enrollments on every
// /settings/profile visit; the brief's route table never stubbed it. Without
// this the component's fetch fails and the section silently hides (it's
// decorative), so this fixture is added purely to render real content for
// the axe scan rather than leaving the completed-courses section empty.
export const PROFILE_ENROLLMENTS = {
  enrollments: [
    { courseId: 'c-1', courseTitle: 'Introduction to Wren', completedAt: NOW },
  ],
};

// Shape verified against LessonView, libs/shared-data-models/src/lib/lesson-view.ts:24-56.
// The brief's LESSON_PAYLOAD was a flat object; the real response nests
// course/lesson, and outline modules use `id` (not `moduleId`) per
// CourseOutline (lesson-view.ts:76-84). videoId/videoState both null here —
// lesson-player-page.component.ts:~140 treats that as PROCESSING, which is
// still real rendered content (see lesson-player-page.component.html
// data-testid="video-processing"), not an error state.
export const LESSON_PAYLOAD = {
  course: { id: 'c-1', title: 'Introduction to Wren', status: 'DRAFT' },
  lesson: {
    id: 'l-1',
    moduleId: 'm-1',
    title: 'Getting started',
    videoId: null,
    videoState: null,
    captions: null,
  },
  progress: { completedAt: null, lastWatchedSeconds: 0 },
  outline: {
    modules: [
      {
        id: 'm-1',
        title: 'Module 1',
        lessons: [
          { id: 'l-1', title: 'Getting started', videoState: null, completedAt: null },
          { id: 'l-2', title: 'Going further', videoState: 'PROCESSING', completedAt: NOW },
        ],
      },
    ],
  },
  materials: [],
};

// Shape verified against CourseTree, libs/shared-data-models/src/lib/wire.ts:11-14,
// and Course, course.ts:15-27 / Module, module.ts:3-10 / Lesson, lesson.ts:3-11.
// The brief called this endpoint `**/api/courses/c-1/tree`; the real route is
// GET /api/courses/:cid (CoursesService.getCourseTree,
// libs/web-courses/src/lib/courses.service.ts:47-49) — `/tree` does not exist.
export const COURSE_TREE = {
  course: {
    id: 'c-1',
    title: 'Introduction to Wren',
    description: 'A short course used by the accessibility sweep.',
    category: 'engineering',
    difficulty: 'BEGINNER',
    instructorId: 'a11y-instructor',
    status: 'DRAFT',
    createdAt: NOW,
    updatedAt: NOW,
  },
  modules: [
    {
      module: {
        id: 'm-1',
        courseId: 'c-1',
        title: 'Module 1',
        order: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      lessons: [
        {
          id: 'l-1',
          moduleId: 'm-1',
          title: 'Getting started',
          order: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    },
  ],
};

// Two-lesson variant of LESSON_PAYLOAD for keyboard journey 3
// (apps/web-e2e/src/a11y/keyboard.a11y.spec.ts). LESSON_PAYLOAD's l-2 is
// deliberately PROCESSING (see its comment) so the base a11y scan still
// covers the "processing" badge; journey 3 needs a second lesson that is
// actually READY and clickable, or keyboard navigation between lessons
// never really happens — outline-panel.component.ts:37-40 bails out of
// navigation for any row whose videoState isn't 'READY'.
const TWO_READY_LESSONS_OUTLINE = {
  modules: [
    {
      id: 'm-1',
      title: 'Module 1',
      lessons: [
        { id: 'l-1', title: 'Getting started', videoState: 'READY', completedAt: null },
        { id: 'l-2', title: 'Going further', videoState: 'READY', completedAt: null },
      ],
    },
  ],
};

export const LESSON_PAYLOAD_L1 = {
  ...LESSON_PAYLOAD,
  outline: TWO_READY_LESSONS_OUTLINE,
};

export const LESSON_PAYLOAD_L2 = {
  ...LESSON_PAYLOAD,
  lesson: { ...LESSON_PAYLOAD.lesson, id: 'l-2', title: 'Going further' },
  outline: TWO_READY_LESSONS_OUTLINE,
};

// Shape verified against CourseTree, wire.ts:11-14 / course.ts:15-27 /
// module.ts:3-10 — a two-module course for keyboard journey 4's reorder
// test. Distinct from COURSE_TREE above (which has one module) because the
// reorder journey needs at least two modules to move.
export const REORDER_COURSE_TREE = {
  course: {
    id: 'c-1',
    title: 'Introduction to Wren',
    description: 'A short course used by the accessibility sweep.',
    category: 'engineering',
    difficulty: 'BEGINNER',
    instructorId: 'a11y-instructor',
    status: 'DRAFT',
    createdAt: NOW,
    updatedAt: NOW,
  },
  modules: [
    {
      module: { id: 'm-1', courseId: 'c-1', title: 'First module', order: 0, createdAt: NOW, updatedAt: NOW },
      // Two lessons so keyboard journey 4/5 can also exercise the LESSON
      // reorder buttons (LessonListComponent.moveLesson), not just modules.
      lessons: [
        { id: 'rl-1', moduleId: 'm-1', title: 'First lesson', order: 0, createdAt: NOW, updatedAt: NOW },
        { id: 'rl-2', moduleId: 'm-1', title: 'Second lesson', order: 1, createdAt: NOW, updatedAt: NOW },
      ],
    },
    {
      module: { id: 'm-2', courseId: 'c-1', title: 'Second module', order: 1, createdAt: NOW, updatedAt: NOW },
      lessons: [],
    },
  ],
};

// courses-list-page and dashboard both call CoursesService.listCourses() ->
// GET /api/courses, which returns Course[] directly (courses.service.ts:44-46)
// — NOT `{ courses: [...] }` as the brief had it, and not the nested
// CourseTree shape either.
export const COURSE_LIST_ITEM = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  instructorId: 'a11y-instructor',
  status: 'DRAFT',
  createdAt: NOW,
  updatedAt: NOW,
};

export const COURSE_LIST = [COURSE_LIST_ITEM];

export const GUEST_ROUTES: RouteFixture[] = [
  { name: 'landing', path: '/', role: 'guest' },
  { name: 'login', path: '/login', role: 'guest' },
  { name: 'register', path: '/register', role: 'guest' },
  { name: 'register confirm', path: '/register/confirm', role: 'guest' },
  { name: 'forgot password', path: '/forgot-password', role: 'guest' },
  { name: 'unlock', path: '/auth/unlock', role: 'guest' },
  {
    name: 'catalogue',
    path: '/catalog',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
    },
    expectText: COURSE_CARD.title,
  },
  {
    name: 'search results',
    path: '/search?q=wren',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/catalog/search**', CATALOG_LIST);
    },
    expectText: COURSE_CARD.title,
  },
  {
    name: 'course detail',
    path: '/catalog/c-1',
    role: 'guest',
    stubs: async (page) => {
      // Broad glob first, specific path last — handlers match in REVERSE order.
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
      await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL);
    },
    expectText: FIRST_LESSON_TITLE,
  },
];

export const AUTHED_ROUTES: RouteFixture[] = [
  {
    // DashboardComponent (apps/web/src/app/dashboard/dashboard.component.ts) only
    // fetches courses when the caller is an instructor; as a student it renders
    // shell content only (welcome banner + sign-out), so there's no
    // student-only data fixture to get wrong here. No stub needed.
    name: 'student dashboard',
    path: '/dashboard',
    role: 'student',
    expectText: 'Signed in as STUDENT',
  },
  {
    name: 'instructor dashboard',
    path: '/dashboard',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/courses', COURSE_LIST);
    },
    expectText: COURSE_LIST_ITEM.title,
  },
  {
    name: 'profile settings',
    path: '/settings/profile',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/profile', PROFILE);
      await stubJson(page, '**/api/profile/instructor-application', { status: 'NONE' });
      await stubJson(page, '**/api/enrollments', PROFILE_ENROLLMENTS);
    },
    expectText: PROFILE.displayName,
  },
  {
    name: 'learn page',
    path: '/learn/c-1/l-1',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/playback/config', { impl: 'fake' });
      await stubJson(page, '**/api/learn/courses/c-1/lessons/l-1', LESSON_PAYLOAD);
    },
    // Not the lesson title — it renders twice (the <h1> and the matching
    // outline row's <span>), which is a Playwright strict-mode violation for
    // getByText. The outline module heading ("Module 1") is unique.
    expectText: 'Module 1',
  },
  {
    name: 'course list',
    path: '/courses',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/courses', COURSE_LIST);
    },
    expectText: COURSE_LIST_ITEM.title,
  },
  {
    name: 'new course form',
    path: '/courses/new',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
    },
    // CATEGORIES renders into <option> elements (course-create-page.component.html:53-55);
    // without this, a fixture-shape bug in CATEGORIES would go unnoticed.
    // <option> text is never reported "visible" by Playwright even when
    // correctly rendered, so this uses the attached-only variant.
    expectText: FIRST_CATEGORY.name,
    expectAttached: true,
  },
  {
    name: 'course editor',
    path: '/courses/c-1/edit',
    role: 'instructor',
    stubs: async (page) => {
      // GET /api/courses/:cid (CoursesService.getCourseTree) — the brief
      // called this `/tree`, which does not exist.
      await stubJson(page, '**/api/courses/c-1', COURSE_TREE);
      await stubJson(page, '**/api/courses/c-1/publish-eligibility', {
        eligible: false,
        reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
      });
      // MaterialsListComponent's constructor effect fetches this
      // unconditionally per lesson (materials-list.component.ts:49-54) — it
      // is not gated behind opening the lesson, so the base editor scan
      // needs it stubbed too, or the request escapes to the dev server.
      await stubJson(page, '**/api/courses/c-1/modules/m-1/lessons/l-1/materials', []);
    },
    expectText: 'Getting started',
  },
  {
    name: 'student roster',
    path: '/courses/c-1/students',
    role: 'instructor',
    stubs: async (page) => {
      // Shape verified against CourseRosterView, roster.ts:18-24 — `courseId`
      // and `totalLessons` are required at the top level (brief's fixture
      // omitted both), and each row needs `progressPercent` (roster.ts:4-15;
      // sortable in course-students-page.component.ts:44-46).
      await stubJson(page, '**/api/courses/c-1/students', {
        courseId: 'c-1',
        totalLessons: 2,
        students: [
          {
            userId: 'a11y-student',
            displayName: 'Sam Student',
            email: 'student@example.com',
            enrolledAt: NOW,
            completedLessons: 1,
            totalLessons: 2,
            progressPercent: 50,
          },
        ],
      });
    },
    expectText: 'Sam Student',
  },
  {
    name: 'course analytics',
    path: '/courses/c-1/analytics',
    role: 'instructor',
    stubs: async (page) => {
      // Shape verified against CourseAnalyticsView, analytics.ts:20-32, and
      // LessonAnalyticsRow, analytics.ts:4-17 — the brief invented field
      // names (averageCompletionPct, lessons[].completionRate /
      // averagePositionPct) that don't exist on either type; the real names
      // are averageCompletionPercent and completionRatePercent /
      // averageWatchedPercent, and totalLessons + generatedAt are required.
      await stubJson(page, '**/api/courses/c-1/analytics', {
        courseId: 'c-1',
        enrolledTotal: 1,
        averageCompletionPercent: 50,
        newEnrollments: { last7Days: 1, last30Days: 1, last90Days: 1 },
        totalLessons: 1,
        lessons: [
          {
            lessonId: 'l-1',
            moduleId: 'm-1',
            title: 'Getting started',
            completionRatePercent: 50,
            watchedStudents: 1,
            averageWatchedSeconds: 42,
            durationSec: 100,
            averageWatchedPercent: 42,
          },
        ],
        generatedAt: NOW,
      });
    },
    expectText: 'Getting started',
  },
  {
    name: 'admin instructor applications',
    path: '/admin/instructor-applications',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/instructor-applications**', {
        applications: [
          {
            uid: 'a11y-applicant',
            displayName: 'Pat Applicant',
            email: 'pat@example.com',
            statement: 'I would like to teach.',
            expertise: 'Wren',
            createdAt: NOW,
          },
        ],
      });
    },
    expectText: 'Pat Applicant',
  },
  {
    name: 'admin user directory',
    path: '/admin/users',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/users**', {
        users: [
          {
            id: 'u1',
            displayName: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'STUDENT',
            status: 'ACTIVE',
            createdAt: NOW,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        capped: false,
      });
    },
    expectText: 'Ada Lovelace',
  },
  {
    name: 'admin user detail',
    path: '/admin/users/u1',
    role: 'admin',
    stubs: async (page) => {
      // Broad glob FIRST, specific detail LAST (reverse-order matching).
      await stubJson(page, '**/api/admin/users**', {
        users: [], total: 0, page: 1, pageSize: 20, capped: false,
      });
      await stubJson(page, '**/api/admin/users/u1', {
        id: 'u1',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        biography: 'Mathematician',
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: NOW,
        enrollments: [
          { courseId: 'c-1', courseTitle: 'Introduction to Wren', status: 'ACTIVE', enrolledAt: NOW },
        ],
        authoredCourses: [],
      });
    },
    expectText: 'Ada Lovelace',
  },
  {
    name: 'admin categories',
    path: '/admin/categories',
    role: 'admin',
    stubs: async (page) => {
      // AdminCategoriesService.list() reads the PUBLIC endpoint, not
      // /api/admin/categories (admin-categories.service.ts:15-17).
      await stubJson(page, '**/api/categories', CATEGORIES);
    },
    expectText: FIRST_CATEGORY.name,
  },
  {
    name: 'admin health',
    path: '/admin/health',
    role: 'admin',
    stubs: async (page) => {
      // Shape verified against AdminHealthReport, admin-health.ts:9-27 —
      // services key on HealthServiceKey ('webServer'|'database'|
      // 'transcodingQueue'|'objectStorage'), not a free-text `name` as the
      // brief had it; stats.pendingTranscodeJobs and generatedAt are
      // required fields the brief omitted. Kept the DOWN row and the alert
      // deliberately — an all-green fixture would never render the
      // color-contrast / role=alert surfaces those exercise.
      await stubJson(page, '**/api/admin/health', {
        services: [
          { key: 'webServer', status: 'UP' },
          { key: 'database', status: 'UP' },
          { key: 'transcodingQueue', status: 'UP', detail: 'fake' },
          { key: 'objectStorage', status: 'DOWN', detail: 'unreachable' },
        ],
        stats: {
          storageUsedBytes: 1024,
          registeredUsers: 3,
          publishedCourses: 1,
          pendingTranscodeJobs: 12,
        },
        alerts: [{ code: 'TRANSCODE_BACKLOG', message: '12 jobs pending.' }],
        generatedAt: NOW,
      });
    },
    expectText: '12 jobs pending.',
  },
];
