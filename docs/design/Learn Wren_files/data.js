// Learn Wren — sample domain data
// Strict to the use-case domain model: courses with modules + lessons,
// instructors, enrolments, progress, difficulty levels, materials.
// Niche / community flavor: bird-watching, fermentation, woodworking,
// field recording, etc.

const COURSES = [
  {
    id: "c-wren-song",
    title: "Reading the Wren's Song",
    instructor: { name: "Etta Holloway", bio: "Field recordist · 14 yrs", avatar: "EH" },
    cover: { tone: "moss", glyph: "♪" },
    level: "Intermediate",
    category: "Field Recording",
    rating: 4.8,
    students: 312,
    durationMin: 184,
    lessonCount: 12,
    moduleCount: 4,
    enrolment: "Free for members",
    description:
      "Spectrograms, dawn-chorus etiquette, and how to identify a Eurasian wren by its rhythm. A practical course for amateur birders moving from listening to recording.",
    badge: "Staff Pick",
  },
  {
    id: "c-sourdough",
    title: "Sourdough, From Starter to Crust",
    instructor: { name: "Mateo Reyes", bio: "Baker, La Cocina co-op", avatar: "MR" },
    cover: { tone: "clay", glyph: "✻" },
    level: "Beginner",
    category: "Fermentation",
    rating: 4.9,
    students: 1287,
    durationMin: 246,
    lessonCount: 18,
    moduleCount: 5,
    enrolment: "Free for members",
    description:
      "A six-week journey from feeding your first culture to a proper open-crumb miche. Includes printable schedules and hydration calculators.",
    badge: "Most Loved",
  },
  {
    id: "c-greenwood",
    title: "Green Woodworking with Hand Tools",
    instructor: { name: "Iris Tomlin", bio: "Spoon carver & teacher", avatar: "IT" },
    cover: { tone: "bark", glyph: "✦" },
    level: "Beginner",
    category: "Craft",
    rating: 4.7,
    students: 642,
    durationMin: 198,
    lessonCount: 14,
    moduleCount: 4,
    enrolment: "Free for members",
    description:
      "Sharpen, split, carve. A patient introduction to working unseasoned wood with axe, knife, and hook — using tools your grandparents would recognise.",
    badge: null,
  },
  {
    id: "c-letterpress",
    title: "Letterpress for Small Editions",
    instructor: { name: "Ola Bergström", bio: "Printer, Hägg & Co.", avatar: "OB" },
    cover: { tone: "paper", glyph: "A" },
    level: "Intermediate",
    category: "Print",
    rating: 4.6,
    students: 218,
    durationMin: 152,
    lessonCount: 10,
    moduleCount: 3,
    enrolment: "Free for members",
    description:
      "Setting type, mixing ink by hand, and getting a clean impression on a Vandercook. Aimed at zine-makers and small-press collaboratives.",
    badge: "New",
  },
  {
    id: "c-mending",
    title: "Visible Mending: Sashiko & Darning",
    instructor: { name: "Hana Maru", bio: "Textile artist", avatar: "HM" },
    cover: { tone: "ochre", glyph: "✕" },
    level: "Beginner",
    category: "Textile",
    rating: 4.9,
    students: 1402,
    durationMin: 132,
    lessonCount: 9,
    moduleCount: 3,
    enrolment: "Free for members",
    description:
      "Repair as ornament. Build a small kit and learn three core stitches you can deploy on jeans, jackets, and the occasional sock.",
    badge: "Staff Pick",
  },
  {
    id: "c-gardens",
    title: "Designing a Quiet Garden",
    instructor: { name: "Pieter Vroom", bio: "Landscape gardener", avatar: "PV" },
    cover: { tone: "ink", glyph: "❦" },
    level: "Advanced",
    category: "Garden",
    rating: 4.5,
    students: 184,
    durationMin: 274,
    lessonCount: 16,
    moduleCount: 5,
    enrolment: "Free for members",
    description:
      "Site reading, plant rhythm, and how to compose a small garden that earns its keep across four seasons. Plenty of plans and plant lists.",
    badge: null,
  },
  {
    id: "c-zine",
    title: "Make a Zine This Weekend",
    instructor: { name: "Cami Park", bio: "Zinester · Risograph", avatar: "CP" },
    cover: { tone: "clay", glyph: "▤" },
    level: "Beginner",
    category: "Print",
    rating: 4.8,
    students: 893,
    durationMin: 96,
    lessonCount: 7,
    moduleCount: 2,
    enrolment: "Free for members",
    description:
      "Folds, layout, and an honest-to-goodness Riso run. Walk away with a finished 12-page zine and the courage to make the next one.",
    badge: null,
  },
  {
    id: "c-knife",
    title: "The Home Cook's Knife",
    instructor: { name: "Yuki Adachi", bio: "Chef, Komorebi", avatar: "YA" },
    cover: { tone: "bark", glyph: "/" },
    level: "Beginner",
    category: "Cooking",
    rating: 4.7,
    students: 2104,
    durationMin: 88,
    lessonCount: 6,
    moduleCount: 2,
    enrolment: "Free for members",
    description:
      "Grip, stance, and the four cuts that cover 90% of weeknight cooking. Pairs nicely with a sharpening stone and a spare evening.",
    badge: "Most Loved",
  },
];

// Active enrolments for the demo student
const ENROLMENTS = [
  {
    courseId: "c-wren-song",
    progress: 0.32,
    lastLesson: { module: 2, lesson: 4, title: "Spectrograms in the field", remainingMin: 9 },
    completedLessons: 4,
    lastWatched: "2 days ago",
  },
  {
    courseId: "c-sourdough",
    progress: 0.61,
    lastLesson: { module: 3, lesson: 11, title: "Shaping a tight boule", remainingMin: 14 },
    completedLessons: 11,
    lastWatched: "yesterday",
  },
  {
    courseId: "c-mending",
    progress: 0.88,
    lastLesson: { module: 3, lesson: 8, title: "Sashiko on denim, finishing", remainingMin: 6 },
    completedLessons: 8,
    lastWatched: "today",
  },
  {
    courseId: "c-knife",
    progress: 1.0,
    lastLesson: { module: 2, lesson: 6, title: "Putting it together: stir-fry", remainingMin: 0 },
    completedLessons: 6,
    lastWatched: "last week",
    completed: true,
  },
];

// Modules + lessons for the lesson-player screen (UC-06-01..04)
const COURSE_OUTLINE = {
  courseId: "c-wren-song",
  modules: [
    {
      id: "m1",
      title: "Listening with intent",
      lessons: [
        { id: "l1", title: "Why we listen", durationMin: 8, status: "complete" },
        { id: "l2", title: "Ear training warm-ups", durationMin: 12, status: "complete" },
        { id: "l3", title: "The dawn chorus, decoded", durationMin: 16, status: "complete" },
      ],
    },
    {
      id: "m2",
      title: "Tools of the trade",
      lessons: [
        { id: "l4", title: "Choosing a recorder", durationMin: 14, status: "complete" },
        { id: "l5", title: "Mics for small birds", durationMin: 19, status: "active" },
        { id: "l6", title: "Wind, weather & you", durationMin: 11, status: "locked" },
      ],
    },
    {
      id: "m3",
      title: "Field practice",
      lessons: [
        { id: "l7", title: "Approaching a song", durationMin: 13, status: "locked" },
        { id: "l8", title: "Spectrograms in the field", durationMin: 22, status: "locked" },
        { id: "l9", title: "Wren or warbler?", durationMin: 17, status: "locked" },
      ],
    },
    {
      id: "m4",
      title: "Editing & publishing",
      lessons: [
        { id: "l10", title: "Cleaning a take", durationMin: 18, status: "locked" },
        { id: "l11", title: "Sharing with attribution", durationMin: 9, status: "locked" },
        { id: "l12", title: "Building a small library", durationMin: 25, status: "locked" },
      ],
    },
  ],
};

const CATEGORIES = ["All", "Field Recording", "Fermentation", "Craft", "Print", "Textile", "Garden", "Cooking"];
const LEVELS = ["All", "Beginner", "Intermediate", "Advanced"];
const SORTS = ["Newest", "Most Popular", "Alphabetical"];

Object.assign(window, { COURSES, ENROLMENTS, COURSE_OUTLINE, CATEGORIES, LEVELS, SORTS });
