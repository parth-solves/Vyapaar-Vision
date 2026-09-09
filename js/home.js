// Vyapar Vision — landing page interactions
// Renders the daily order pulse using the dates in the sample data.

async function renderPulseStrip() {
  const strip = document.getElementById('pulseStrip');
  if (!strip) return;

  const orders = await fetch('data/sample-orders.json').then(response => response.json());
  const dailyOrders = orders.reduce((days, order) => {
    days[order.date] = (days[order.date] || 0) + 1;
    return days;
  }, {});
  const dates = Object.keys(dailyOrders).sort((a, b) => {
    const [dayA, monthA, yearA] = a.split('/').map(Number);
    const [dayB, monthB, yearB] = b.split('/').map(Number);
    return new Date(yearA, monthA - 1, dayA) - new Date(yearB, monthB - 1, dayB);
  });
  const dailyCounts = dates.map(date => dailyOrders[date]);
  const max = Math.max(...dailyCounts, 1);
  const warmThreshold = max * 0.65;

  dailyCounts.forEach((value, dayIndex) => {
    const bar = document.createElement('div');
    const pct = Math.max(6, Math.round((value / max) * 100));
    bar.className = 'pulse-bar';
    bar.style.height = pct + '%';
    bar.style.animationDelay = (dayIndex * 0.03) + 's';

    if (value === max) bar.classList.add('hot');
    else if (value >= warmThreshold) bar.classList.add('warm');

    bar.title = `${dates[dayIndex]} — ${value} orders`;
    strip.appendChild(bar);
  });
}

document.addEventListener('DOMContentLoaded', renderPulseStrip);
