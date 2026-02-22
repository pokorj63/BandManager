const eventsByDate = {};
const eventsData = [{ date: '2026-02-28', title: 'hihi' }];

eventsData.forEach(ev => {
    const d = ev.date;
    if (!eventsByDate[d]) eventsByDate[d] = [];
    eventsByDate[d].push(ev);
});

const year = 2026;
const month = 1; // 0-indexed Feb
const totalDays = 28;

for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (eventsByDate[dateStr]) {
        console.log(`Found event on ${dateStr}!`, eventsByDate[dateStr]);
    }
}
