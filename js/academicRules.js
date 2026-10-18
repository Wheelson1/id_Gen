/**
 * academicRules.js — Institutional Course Durations & Graduation Year Engine
 * 
 * Rules:
 *  - Education: 4 years
 *  - Science: 4 years
 *  - Law: 5 years
 *  - Management Sciences: 4 years
 *  - Social Sciences and Humanities: 4 years
 *  - Health Science & Technology (Presco - MedLab, Public Health): 4 years
 *  - Basic Medical Sciences (Presco - Anatomy, Physiology): 4 years
 *  - Clinical Medicine (MBBS): 6 years
 *  - Agricultural and Natural Resource Management: 5 years
 * 
 * Formula:
 *  Admission Year is determined by the student's Registration Number (e.g. 2025... -> 2025).
 *  Graduation Year = Admission Year + Course Duration.
 *  e.g.:
 *    2025... in Science (4 yrs) -> 2029
 *    2025... in Law (5 yrs)     -> 2030
 *    2024... in Law (5 yrs)     -> 2029
 *    2024... in Education (4 yrs)-> 2028
 */

const ACADEMIC_RULES = {
  // Course duration in years by faculty
  FACULTY_DURATIONS: {
    'Education': 4,
    'Science': 4,
    'Law': 5,
    'Management Sciences': 4,
    'Social Sciences and Humanities': 4,
    'Health Science and Technology': 4,
    'Basic Medical Sciences': 4,
    'Clinical Medicine': 6,
    'Agricultural and Natural Resource Management': 5
  },

  // Specific Department overrides if any
  DEPARTMENT_DURATIONS: {
    // Law
    'Civil Law': 5,
    'Public Law': 5,
    'Commercial Law': 5,
    'Private and Property Law': 5,

    // Clinical Medicine
    'Medicine and Surgery': 6,
    'Community Medicine': 6,

    // Presco courses (user rule: MedLab & Anatomy are 4 years)
    'Medical Laboratory Science': 4,
    'Human Anatomy': 4,
    'Medical Physiology': 4,
    'Nursing Science': 4,
    'Public Health': 4,

    // Agriculture 5 yrs
    'Agricultural Economics': 5,
    'Animal Science': 5,
    'Crop Production and Landscape': 5,
    'Fisheries and Aquaculture': 5,
    'Food Science and Technology': 5,
    'Soil Science': 5
  },

  /**
   * Extracts admission year from Reg No / Matric / JAMB No
   * Supports patterns:
   *   - 202552179149SI -> 2025
   *   - EBSU/2024/98421 -> 2024
   *   - EBSU/2023/123456 -> 2023
   *   - 2026/2027 session -> 2026
   */
  extractAdmissionYear(regNo, sessionFallback = '') {
    if (regNo) {
      const clean = String(regNo).trim();
      // Match 4 digits starting with 20 (e.g. 2023, 2024, 2025, 2026)
      const match = clean.match(/(20\d{2})/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    if (sessionFallback) {
      const match = String(sessionFallback).match(/(20\d{2})/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // Default institutional active year
    return 2024;
  },

  /**
   * Retrieves course duration for a faculty and department
   */
  getCourseDuration(faculty, department = '') {
    if (department && this.DEPARTMENT_DURATIONS[department]) {
      return this.DEPARTMENT_DURATIONS[department];
    }

    // Check fuzzy match on department name
    const deptLower = (department || '').toLowerCase();
    if (deptLower.includes('law')) return 5;
    if (deptLower.includes('medicine') || deptLower.includes('surgery')) return 6;
    if (deptLower.includes('anatomy') || deptLower.includes('lab') || deptLower.includes('physiology')) return 4;

    // Check faculty
    if (faculty && this.FACULTY_DURATIONS[faculty]) {
      return this.FACULTY_DURATIONS[faculty];
    }

    const facLower = (faculty || '').toLowerCase();
    if (facLower.includes('law')) return 5;
    if (facLower.includes('educat')) return 4;
    if (facLower.includes('science') && !facLower.includes('management')) return 4;
    if (facLower.includes('management')) return 4;
    if (facLower.includes('social') || facLower.includes('humanities')) return 4;
    if (facLower.includes('health') || facLower.includes('basic medical') || facLower.includes('presco')) return 4;
    if (facLower.includes('agric')) return 5;
    if (facLower.includes('clinical')) return 6;

    return 4; // Default standard university duration
  },

  /**
   * Computes the official graduation year (expiry) based on Reg No + Course Duration
   */
  calculateGraduationYear(regNo, faculty, department = '', sessionFallback = '') {
    const admissionYear = this.extractAdmissionYear(regNo, sessionFallback);
    const duration = this.getCourseDuration(faculty, department);
    return admissionYear + duration;
  },

  /**
   * Returns human-readable explanation
   */
  explainGraduationYear(regNo, faculty, department = '', sessionFallback = '') {
    const admissionYear = this.extractAdmissionYear(regNo, sessionFallback);
    const duration = this.getCourseDuration(faculty, department);
    const gradYear = admissionYear + duration;
    return `Admission Year: ${admissionYear} · Course Duration: ${duration} Yrs · Graduation / Expiry: ${gradYear}`;
  }
};

window.ACADEMIC_RULES = ACADEMIC_RULES;
