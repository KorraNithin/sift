export const STAGES = ['sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered', 'joined', 'rejected'];

const TRANSITIONS = {
  recruiter: {
    sourced: ['screened', 'rejected'],
    screened: ['sourced', 'submitted', 'rejected'],
    submitted: ['screened', 'rejected'],
    shortlisted: ['interview', 'rejected'],
    interview: ['offered', 'rejected'],
    offered: ['joined', 'rejected'],
    joined: [],
    rejected: ['screened'],
  },
  client: {
    submitted: ['shortlisted', 'interview', 'rejected'],
    shortlisted: ['interview', 'rejected'],
    interview: ['rejected'],
  },
};

/** Whether `role` may move an application from one stage to another. */
export const canMove = (role, from, to) => TRANSITIONS[role]?.[from]?.includes(to) ?? false;
