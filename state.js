/**
 * state.js — Centralised application state management.
 * All feature modules read/write through AppState to avoid globals.
 */
const AppState = (() => {
  function newStudent() {
    return {
      name: '', matric: '', faculty: '', dept: '',
      level: '100 Level', session: '2024/2025',
      blood: 'O+', genotype: 'AA',
      photo: null, sig: null,
      // Set by the issue-card Edge Function after a successful card issuance.
      // cardId  = UUID stored in the database (the card's unique identifier)
      // qrString = opaque token "EBSU1:<cardId>:<ed25519Sig>" encoded in the QR
      cardId:   null,
      qrString: null,
    };
  }

  const state = {
    schoolName: 'EBONYI STATE UNIVERSITY, ABAKALIKI',
    expiry: '2029',
    customLogo: null,
    students: [newStudent()],
    activeIdx: 0,
    layout: 'single',
    page: 'form',
    colors: {
      headerBg:        '#1558c0',
      headerText:      '#ffffff',
      bodyBg:          '#ffffff',
      borderColor:     '#6ab0e0',
      titleColor:      '#cc0000',
      matricLabel:     '#1a3a9a',
      labelColor:      '#000000',
      valueColor:      '#222222',
      photoBackground: '#aa1111'
    }
  };

  return {
    get: key => (key ? state[key] : { ...state }),

    set: (key, value) => { state[key] = value; },

    currentStudent: () => state.students[state.activeIdx],

    addStudent() {
      state.students.push(newStudent());
      state.activeIdx = state.students.length - 1;
    },

    removeStudent() {
      if (state.students.length <= 1) return;
      state.students.splice(state.activeIdx, 1);
      state.activeIdx = Math.max(0, state.activeIdx - 1);
    },

    switchStudent: idx => { state.activeIdx = idx; },

    newStudent,

    updateColor(key, val) {
      state.colors[key] = val;
    },

    setLayout(l) { state.layout = l; },
    setPage(p)   { state.page   = p; }
  };
})();
