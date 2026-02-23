// This is a dummy config while for generating events
// for the calendar demo. Feel free to remove it.
import { type CalendarEvent } from "@/components/application/calendar/calendar";

/**
 * Create a date object for an event
 * @param dayOfWeek - The day of the week (1-7)
 * @param hour - The hour of the day (0-23)
 * @param minute - The minute of the hour (0-59)
 * @returns A date object
 */
function createEventDate(dayOfWeek: number, hour: number, minute: number = 0): Date {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const targetDayOffset = (dayOfWeek - currentDay + 7) % 7; // Calculate offset to target day of the *current* week
    const targetDate = new Date(now.setDate(now.getDate() + targetDayOffset));
    targetDate.setHours(hour, minute, 0, 0);
    return targetDate;
}

/**
 * Create a date object for the end of an event
 * @param startDate - The start date of the event
 * @param durationMinutes - The duration of the event in minutes
 * @returns A date object
 */
function createEventEndDate(startDate: Date, durationMinutes: number): Date {
    return new Date(startDate.getTime() + durationMinutes * 60000);
}

const baseDateMonday = createEventDate(1, 9); // Monday 9 AM
const baseDateTuesday = createEventDate(2, 10, 30); // Tuesday 10:30 AM
const baseDateWednesday = createEventDate(3, 10); // Wednesday 10:00 AM
const baseDateThursday = createEventDate(4, 12); // Thursday 12:00 PM
const baseDateFriday = createEventDate(5, 9); // Friday 9:00 AM
const baseDateSaturday = createEventDate(6, 11); // Saturday 11:00 AM
const baseDateSunday = createEventDate(7 % 7, 13); // Sunday 1:00 PM

// --- New events base dates ---

// Week 1
const baseDateMon1100 = createEventDate(1, 11, 0);
const baseDateTue1430 = createEventDate(2, 14, 30); // 2:30 PM
const baseDateWed0900 = createEventDate(3, 9, 0);
const baseDateWed1030 = createEventDate(3, 10, 30);
const baseDateWed1330 = createEventDate(3, 13, 30); // 1:30 PM
const baseDateWed1500 = createEventDate(3, 15, 0); // 3:00 PM
const baseDateFri1000 = createEventDate(5, 10, 0);
const baseDateFri1330 = createEventDate(5, 13, 30); // 1:30 PM

// Week 0 (Previous week - for Mon 30/Tue 31 in screenshot)
const baseDatePrevMon1130 = createEventDate(1, 11, 30);
baseDatePrevMon1130.setDate(baseDatePrevMon1130.getDate() - 7);
const baseDatePrevMon1430 = createEventDate(1, 14, 30);
baseDatePrevMon1430.setDate(baseDatePrevMon1430.getDate() - 7); // 2:30 PM
const baseDatePrevThu1600 = createEventDate(4, 16, 0);
baseDatePrevThu1600.setDate(baseDatePrevThu1600.getDate() - 7); // 4:00 PM
const baseDatePrevThu1830 = createEventDate(4, 18, 30);
baseDatePrevThu1830.setDate(baseDatePrevThu1830.getDate() - 7); // 6:30 PM

// Week 2
const baseDateW2Mon1215 = createEventDate(1, 12, 15);
baseDateW2Mon1215.setDate(baseDateW2Mon1215.getDate() + 7);
const baseDateW2Wed0930 = createEventDate(3, 9, 30);
baseDateW2Wed0930.setDate(baseDateW2Wed0930.getDate() + 7);
const baseDateW2Thu1000 = createEventDate(4, 10, 0);
baseDateW2Thu1000.setDate(baseDateW2Thu1000.getDate() + 7);
const baseDateW2Thu1600 = createEventDate(4, 16, 0);
baseDateW2Thu1600.setDate(baseDateW2Thu1600.getDate() + 7); // 4:00 PM
const baseDateW2Fri0930 = createEventDate(5, 9, 30);
baseDateW2Fri0930.setDate(baseDateW2Fri0930.getDate() + 7);
const baseDateW2Fri1430 = createEventDate(5, 14, 30);
baseDateW2Fri1430.setDate(baseDateW2Fri1430.getDate() + 7); // 2:30 PM
const baseDateW2Sat0700 = createEventDate(6, 7, 0);
baseDateW2Sat0700.setDate(baseDateW2Sat0700.getDate() + 7);

// Week 3
const baseDateW3Mon0915 = createEventDate(1, 9, 15);
baseDateW3Mon0915.setDate(baseDateW3Mon0915.getDate() + 14);
const baseDateW3Tue1130 = createEventDate(2, 11, 30);
baseDateW3Tue1130.setDate(baseDateW3Tue1130.getDate() + 14);
const baseDateW3Tue1300 = createEventDate(2, 13, 0);
baseDateW3Tue1300.setDate(baseDateW3Tue1300.getDate() + 14); // 1:00 PM
const baseDateW3Wed0900 = createEventDate(3, 9, 0);
baseDateW3Wed0900.setDate(baseDateW3Wed0900.getDate() + 14);
const baseDateW3Wed1430 = createEventDate(3, 14, 30);
baseDateW3Wed1430.setDate(baseDateW3Wed1430.getDate() + 14); // 2:30 PM
const baseDateW3Thu1000 = createEventDate(4, 10, 0);
baseDateW3Thu1000.setDate(baseDateW3Thu1000.getDate() + 14);
const baseDateW3Thu1900 = createEventDate(4, 19, 0);
baseDateW3Thu1900.setDate(baseDateW3Thu1900.getDate() + 14); // 7:00 PM
const baseDateW3Fri1345 = createEventDate(5, 13, 45);
baseDateW3Fri1345.setDate(baseDateW3Fri1345.getDate() + 14); // 1:45 PM
const baseDateW3Fri1430 = createEventDate(5, 14, 30);
baseDateW3Fri1430.setDate(baseDateW3Fri1430.getDate() + 14); // 2:30 PM

// Week 4
const baseDateW4Mon1100 = createEventDate(1, 11, 0);
baseDateW4Mon1100.setDate(baseDateW4Mon1100.getDate() + 21);
const baseDateW4Tue1245 = createEventDate(2, 12, 45);
baseDateW4Tue1245.setDate(baseDateW4Tue1245.getDate() + 21);
const baseDateW4Wed0930 = createEventDate(3, 9, 30);
baseDateW4Wed0930.setDate(baseDateW4Wed0930.getDate() + 21);
const baseDateW4Thu1600 = createEventDate(4, 16, 0);
baseDateW4Thu1600.setDate(baseDateW4Thu1600.getDate() + 21); // 4:00 PM
const baseDateW4Thu1730 = createEventDate(4, 17, 30);
baseDateW4Thu1730.setDate(baseDateW4Thu1730.getDate() + 21); // 5:30 PM
const baseDateW4Sun0900 = createEventDate(7 % 7, 9, 0);
baseDateW4Sun0900.setDate(baseDateW4Sun0900.getDate() + 21); // Use getDate()+21 because createEventDate already put it in the current week

export const events: CalendarEvent[] = [
    // Existing week 1
    { id: "event-01", title: "Monday standup", start: baseDateMonday, end: createEventEndDate(baseDateMonday, 30) },
    { id: "event-02", title: "Product demo", start: baseDateTuesday, end: createEventEndDate(baseDateTuesday, 60), color: "blue" },
    { id: "event-03", title: "One-on-one w/ Eva", start: baseDateWednesday, end: createEventEndDate(baseDateWednesday, 45), color: "pink" },
    { id: "event-04", title: "Lunch with Olivia", start: baseDateThursday, end: createEventEndDate(baseDateThursday, 60), color: "green", dot: true },
    { id: "event-05", title: "Friday standup", start: baseDateFriday, end: createEventEndDate(baseDateFriday, 30) },
    { id: "event-06", title: "House inspection", start: baseDateSaturday, end: createEventEndDate(baseDateSaturday, 90), color: "orange" },
    { id: "event-07", title: "Ava's engagment party", start: baseDateSunday, end: createEventEndDate(baseDateSunday, 180), color: "purple", dot: true },

    // New week 1
    { id: "event-08", title: "Content planning", start: baseDateMon1100, end: createEventEndDate(baseDateMon1100, 60), color: "blue" },
    { id: "event-09", title: "Catch up w/ Alex", start: baseDateTue1430, end: createEventEndDate(baseDateTue1430, 60), color: "pink" },
    { id: "event-10", title: "Deep work", start: baseDateWed0900, end: createEventEndDate(baseDateWed0900, 90), color: "blue" },
    { id: "event-11", title: "Design sync", start: baseDateWed1030, end: createEventEndDate(baseDateWed1030, 60), color: "blue" },
    { id: "event-12", title: "SEO planning", start: baseDateWed1330, end: createEventEndDate(baseDateWed1330, 60), color: "blue" },
    { id: "event-13", title: "Meetup event", start: baseDateWed1500, end: createEventEndDate(baseDateWed1500, 90), color: "yellow" },
    { id: "event-14", title: "Olivia x Riley", start: baseDateFri1000, end: createEventEndDate(baseDateFri1000, 60), color: "purple" },
    { id: "event-15", title: "Product demo", start: baseDateFri1330, end: createEventEndDate(baseDateFri1330, 120), color: "blue" },

    // Week 0 (Previous)
    { id: "event-16", title: "Coffee with Ali", start: baseDatePrevMon1130, end: createEventEndDate(baseDatePrevMon1130, 60) },
    { id: "event-17", title: "Marketing site kickoff", start: baseDatePrevMon1430, end: createEventEndDate(baseDatePrevMon1430, 90) },
    { id: "event-18", title: "All-hands meeting", start: baseDatePrevThu1600, end: createEventEndDate(baseDatePrevThu1600, 90) },
    { id: "event-19", title: "Dinner with Candice", start: baseDatePrevThu1830, end: createEventEndDate(baseDatePrevThu1830, 90) },

    // Week 2
    { id: "event-20", title: "Team lunch", start: baseDateW2Mon1215, end: createEventEndDate(baseDateW2Mon1215, 60), color: "pink" },
    { id: "event-21", title: "Product planning", start: baseDateW2Wed0930, end: createEventEndDate(baseDateW2Wed0930, 90), color: "blue" },
    { id: "event-22", title: "Amélie's first day", start: baseDateW2Thu1000, end: createEventEndDate(baseDateW2Thu1000, 60), color: "pink" },
    { id: "event-23", title: "All-hands meeting", start: baseDateW2Thu1600, end: createEventEndDate(baseDateW2Thu1600, 90) },
    { id: "event-24", title: "Coffee w/ Amélie", start: baseDateW2Fri0930, end: createEventEndDate(baseDateW2Fri0930, 60), color: "pink" },
    { id: "event-25", title: "Design feedback session", start: baseDateW2Fri1430, end: createEventEndDate(baseDateW2Fri1430, 60), color: "pink" },
    { id: "event-26", title: "Half marathon", start: baseDateW2Sat0700, end: createEventEndDate(baseDateW2Sat0700, 180), color: "green" },

    // Week 3
    { id: "event-101", title: "Team offsite", start: baseDateW3Mon0915, end: createEventEndDate(baseDateW3Mon0915, 2400), color: "green" },
    { id: "event-27", title: "Deep work", start: baseDateW3Mon0915, end: createEventEndDate(baseDateW3Mon0915, 120), color: "blue" },
    { id: "event-28", title: "Quarterly review", start: baseDateW3Tue1130, end: createEventEndDate(baseDateW3Tue1130, 90), color: "orange" },
    { id: "event-29", title: "Lunch with Zahir", start: baseDateW3Tue1300, end: createEventEndDate(baseDateW3Tue1300, 60), color: "green" },
    { id: "event-30", title: "Deep work", start: baseDateW3Wed0900, end: createEventEndDate(baseDateW3Wed0900, 120), color: "blue" },
    { id: "event-31", title: "Design sync", start: baseDateW3Wed1430, end: createEventEndDate(baseDateW3Wed1430, 60), color: "blue" },
    { id: "event-32", title: "Amélie coffee", start: baseDateW3Thu1000, end: createEventEndDate(baseDateW3Thu1000, 60), color: "pink" },
    { id: "event-33", title: "Dinner with Candice", start: baseDateW3Thu1900, end: createEventEndDate(baseDateW3Thu1900, 90) },
    { id: "event-34", title: "Accountant", start: baseDateW3Fri1345, end: createEventEndDate(baseDateW3Fri1345, 60), color: "yellow" },
    { id: "event-35", title: "Marketing site sync", start: baseDateW3Fri1430, end: createEventEndDate(baseDateW3Fri1430, 60) },

    // Week 4
    { id: "event-36", title: "Content planning session", start: baseDateW4Mon1100, end: createEventEndDate(baseDateW4Mon1100, 90), color: "blue" },
    { id: "event-37", title: "Lunch with Ali", start: baseDateW4Tue1245, end: createEventEndDate(baseDateW4Tue1245, 60), color: "purple" },
    { id: "event-38", title: "Product planning", start: baseDateW4Wed0930, end: createEventEndDate(baseDateW4Wed0930, 90), color: "blue" },
    { id: "event-39", title: "All-hands meeting", start: baseDateW4Thu1600, end: createEventEndDate(baseDateW4Thu1600, 90) },
    { id: "event-40", title: "Team dinner", start: baseDateW4Thu1730, end: createEventEndDate(baseDateW4Thu1730, 120), color: "pink" },
    { id: "event-41", title: "Drive to Sydney", start: baseDateW4Sun0900, end: createEventEndDate(baseDateW4Sun0900, 8 * 60), color: "orange" },
];
