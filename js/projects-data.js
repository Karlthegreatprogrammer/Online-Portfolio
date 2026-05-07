window.KARLFORGE_PROJECTS = [
  {
    slug: "lingkod-bayan-monitoring-system",
    title: "Lingkod Bayan Unit Records Management System",
    shortDescription: "Web-based internal records platform for client assistance, CEU records, referrals, and reports.",
    description:
      "The Lingkod Bayan Unit Records Management System is a web-based internal records platform designed to help manage client assistance records, CEU databases, barangay-based information, referrals, and reports. The system supports faster record searching, cleaner data organization, and easier updates for local government service operations.",
    role: "Full-Stack Developer",
    categoryTags: ["Web Systems", "Government System"],
    techStack: ["HTML", "CSS", "JavaScript", "Supabase", "SQL", "Excel/XLSX"],
    image: "assets/images/case-lingkod-records.png",
    imageAlt: "Lingkod Bayan records table interface",
    problem:
      "The existing workflow involved handling large amounts of client and barangay-related data from forms, spreadsheets, and database records. Some fields were too strict, such as requiring Purok/Sitio even though not all locations use that address structure. The CEU database also needed additional datasets, including Sample Leaders Identified, while maintaining the same searchable and editable structure used in other database sections.",
    features: [
      "Updated the Client Assistance Record form so Purok/Sitio became optional while Barangay remained required.",
      "Fixed the searchable Purok/Sitio input behavior so deleted values would not automatically return.",
      "Integrated the Sample Leaders Identified dataset into the CEU Records Database.",
      "Processed Excel source data and converted it into structured Supabase-ready records.",
      "Added 681 Sample Leaders records grouped across barangay sections.",
      "Ensured each Sample Leaders row followed the same Edit/Delete action format as other CEU records.",
      "Excluded unnecessary discussion-related fields to keep the database focused and cleaner.",
      "Updated SQL seed and upsert files to support repeatable database imports without duplicating records.",
    ],
    caseStudy: [
      {
        eyebrow: "Goal",
        title: "Make record management more flexible and consistent",
        body:
          "The goal was to improve data flexibility, make record management easier, and preserve consistency across the system. This included making address handling more practical, importing structured Excel data, grouping records per barangay, and supporting edit/delete actions for database maintenance.",
      },
      {
        eyebrow: "Implementation Approach",
        title: "Reused the existing database pattern",
        body:
          "I first reviewed the existing CEU database structure to understand how categories, search filters, barangay grouping, and CRUD actions were implemented. Instead of creating a separate custom interface, I reused the existing database pattern so the Sample Leaders section would behave consistently with the rest of the system.",
      },
      {
        eyebrow: "Data Handling",
        title: "Converted spreadsheet data into clean database records",
        body:
          "For the Excel data, I extracted only the relevant fields such as barangay, purok/sitio/subdivision, position, name, address details, contact number, assistance given, and code source. I intentionally excluded program discussion, date attended, and content of discussion fields to keep the section aligned with the requested database scope.",
      },
      {
        eyebrow: "Challenges",
        title: "Improving flexibility without breaking existing behavior",
        body:
          "One challenge was making the address form flexible without breaking existing records and validations. Another was importing spreadsheet data while preserving the existing database structure, search behavior, and barangay-based grouping. The system also needed to support future edits, deletes, and re-imports safely.",
      },
      {
        eyebrow: "Result",
        title: "Cleaner records, faster searching, and easier updates",
        body:
          "The project improved both usability and data quality. Users can now submit client records without being forced to enter Purok/Sitio when it does not apply. The CEU Records Database also now includes the Sample Leaders Identified section with searchable, barangay-grouped records and consistent Edit/Delete actions.",
      },
      {
        eyebrow: "Impact",
        title: "More practical local government record management",
        body:
          "This project helped make the records system more practical for real-world barangay data, reduced form friction, and improved database maintainability. It also transformed spreadsheet-based information into a structured, searchable, and editable web database suitable for ongoing local government record management.",
      },
    ],
    links: {
      live: "",
      source: "",
    },
  },
  {
    slug: "roblox-zombie-survival",
    title: "Roblox Zombie Survival",
    shortDescription: "Game concept with wave progression, survival systems, and replayable loops.",
    description:
      "A Roblox survival game concept focused on wave-based pressure, defensive play, progression, and replayable systems.",
    role: "Roblox Game Developer",
    categoryTags: ["Roblox"],
    techStack: ["Roblox Studio", "Lua", "Game Design"],
    image: "assets/images/project-zombie-shooter.png",
    imageAlt: "Roblox Zombie Shooter Survival concept card",
    problem:
      "The goal was to shape a survival loop that feels tense, readable, and replayable while keeping the systems organized enough to expand later.",
    features: [
      "Wave-based enemy pressure and survival pacing.",
      "Base defense concept with barricades and player positioning.",
      "Replayable progression ideas for weapons, upgrades, and rewards.",
      "Game design direction for UI, loops, and long-term systems.",
    ],
    links: {
      live: "",
      source: "",
    },
  },
  {
    slug: "karlforge-portfolio",
    title: "KarlForge Portfolio",
    shortDescription: "Portfolio built to present project proof, skills, and client-ready credibility.",
    description:
      "A personal portfolio website built around strong first impressions, practical project proof, and responsive presentation for mobile and desktop.",
    role: "Frontend Developer / UI Designer",
    categoryTags: ["Portfolio"],
    techStack: ["HTML", "CSS", "JavaScript", "Netlify"],
    image: "assets/images/project-karlforge-portfolio.png",
    imageAlt: "KarlForge portfolio website preview",
    problem:
      "The goal was to turn a simple portfolio into a focused personal brand experience that quickly communicates skills, style, and credibility.",
    features: [
      "Responsive landing page with desktop and mobile-specific hero layouts.",
      "Dark and light theme support with official KarlForge logo variants.",
      "Featured project cards, contact flows, and visual proof sections.",
      "Clean static structure that is easy to update and deploy.",
    ],
    links: {
      live: "",
      source: "",
    },
  },
  {
    slug: "brkb-digital-solutions",
    title: "BRKB Digital Solutions",
    shortDescription:
      "Service website concept built to market web design offers, strengthen brand trust, and turn visitors into client inquiries.",
    description:
      "A premium digital agency website concept for BRKB Digital Solutions, focused on professional presentation, clear services, and conversion-ready calls to action.",
    role: "Frontend Developer / UI Designer",
    categoryTags: ["Web Systems"],
    techStack: ["HTML", "CSS", "JavaScript", "Web Design"],
    image: "assets/images/project-brkb-digital.png",
    imageAlt: "BRKB Digital Solutions website preview",
    problem:
      "The goal was to position BRKB as a professional web design and development service for businesses and personal brands that need a stronger online presence.",
    features: [
      "Premium agency-style hero section with clear service positioning.",
      "Conversion-focused buttons for quotes and work exploration.",
      "Trust-building stats for delivered projects, response time, and availability.",
      "Clean monochrome visual direction that matches a modern digital service brand.",
    ],
    links: {
      live: "",
      source: "",
    },
  },
];
