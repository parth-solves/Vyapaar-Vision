// =====================================================================
// VYAPAR VISION — app.js
// =====================================================================

let ORDERS = [];
let charts = {};

const COLORS = {
  marigold: '#C1443A',
  genderMale: '#F28C28',
  genderFemale: '#94A3B8',
  teal: '#4C8087',
  coral: '#D98A3C',
  violet: '#7C6088',
  blue: '#3E6E8C',

  // Grey shades for zero-value gender categories
  grey1: '#5E5A52',
  grey2: '#403D37',

  grid: 'rgba(150,140,120,0.18)',
  muted: '#8A8172'
};


// =====================================================================
// GENDER HELPERS
// =====================================================================

function normalizeGender(value) {
  const gender = String(value || '')
    .trim()
    .toLowerCase();

  if (
    gender === 'female' ||
    gender === 'f'
  ) {
    return 'Female';
  }

  if (
    gender === 'male' ||
    gender === 'm'
  ) {
    return 'Male';
  }

  return 'Unknown';
}


// =====================================================================
// FILE HANDLING
// =====================================================================

function setupDropZone() {
  const zone =
    document.getElementById('dropZone');

  const input =
    document.getElementById('fileInput');

  if (!zone || !input) return;

  zone.addEventListener(
    'click',
    () => input.click()
  );

  ['dragenter', 'dragover'].forEach(
    evt => {
      zone.addEventListener(
        evt,
        e => {
          e.preventDefault();
          zone.classList.add('drag');
        }
      );
    }
  );

  ['dragleave', 'drop'].forEach(
    evt => {
      zone.addEventListener(
        evt,
        e => {
          e.preventDefault();
          zone.classList.remove('drag');
        }
      );
    }
  );

  zone.addEventListener(
    'drop',
    e => {
      handleFiles(
        [...e.dataTransfer.files]
      );
    }
  );

  input.addEventListener(
    'change',
    () => {
      handleFiles([...input.files]);
    }
  );
}


// =====================================================================
// HANDLE PDF FILES
// =====================================================================

async function handleFiles(files) {
  const pdfFiles =
    files.filter(
      f =>
        f.type === 'application/pdf' ||
        f.name
          .toLowerCase()
          .endsWith('.pdf')
    );

  if (!pdfFiles.length) {
    alert(
      'Please upload PDF shipping labels (the label PDF you download from the marketplace).'
    );

    return;
  }

  const queue =
    document.getElementById(
      'queueList'
    );

  if (!queue) return;

  queue.innerHTML = '';

  for (const file of pdfFiles) {
    const row =
      document.createElement('div');

    row.className =
      'queue-item';

    row.innerHTML = `
      <span class="spinner"></span>
      <span class="fname">
        ${file.name}
      </span>
      <span class="status">
        Reading…
      </span>
    `;

    queue.appendChild(row);

    try {
      const result =
        await parsePdfFile(
          file,
          {
            onOcrStart:
              (pageNum, total) => {
                const status =
                  row.querySelector(
                    '.status'
                  );

                if (status) {
                  status.textContent =
                    `Scanning page ${pageNum}/${total} (OCR)…`;
                }
              }
          }
        );


      // =============================================================
      // SAVE PARSED ORDERS
      // =============================================================

      result.pages.forEach(p => {

        /*
         * IMPORTANT:
         *
         * detectedGender = gender detected from the receipt/customer
         *
         * selectedGender = dropdown selection
         *
         * The chart uses detectedGender.
         */

        const detectedGender =
          normalizeGender(
            p.fields.gender
          );


        ORDERS.push({

          ...p.fields,

          // Original gender detected by parser
          detectedGender:

            detectedGender,

          // Dropdown starts with detected value
          selectedGender:

            detectedGender,

          // Keep old field for compatibility
          gender:

            detectedGender,

          marketplace:
            p.marketplace.label,

          marketplaceId:
            p.marketplace.id,

          fileName:
            file.name,

          page:
            p.pageNum
        });

      });


      const anyOcr =
        result.pages.some(
          p => p.ocrUsed
        );


      const marketplaceLabels =
        [
          ...new Set(
            result.pages.map(
              p =>
                p.marketplace.label
            )
          )
        ].join(', ');


      row
        .querySelector(
          '.spinner'
        )
        ?.remove();


      row.innerHTML = `
        <span class="mk-tag">
          ${marketplaceLabels}
        </span>

        <span class="fname">
          ${file.name}
        </span>

        <span class="status ok">
          ${
            result.pageCount > 1
              ? result.pageCount +
                ' orders found ✓'
              : 'Parsed ✓'
          }

          ${
            anyOcr
              ? ' (OCR)'
              : ''
          }
        </span>
      `;

    } catch (err) {

      console.error(err);

      row
        .querySelector(
          '.spinner'
        )
        ?.remove();


      row.innerHTML = `
        <span class="fname">
          ${file.name}
        </span>

        <span
          class="status err"
          title="${(
            (err &&
              err.message) ||
            err
          )
            .toString()
            .replace(
              /"/g,
              '&quot;'
            )}"
        >
          Couldn't read this file —
          ${
            err &&
            err.message
              ? err.message.slice(
                  0,
                  60
                )
              : 'unknown error'
          }
        </span>
      `;
    }
  }

  renderEverything();
}


// =====================================================================
// DEMO DATA
// =====================================================================

async function loadDemoData() {

  try {

    const res =
      await fetch(
        'data/sample-orders.json'
      );


    if (!res.ok) {
      throw new Error(
        `Could not load sample-orders.json (${res.status})`
      );
    }


    const demo =
      await res.json();


    if (!Array.isArray(demo)) {
      throw new Error(
        'sample-orders.json must contain an array of orders.'
      );
    }


    ORDERS =
      demo.map(order => {

        const detectedGender =
          normalizeGender(
            order.gender
          );


        return {

          ...order,

          detectedGender:
            detectedGender,

          selectedGender:
            detectedGender,

          gender:
            detectedGender
        };

      });


    renderEverything();

  } catch (error) {

    console.error(
      'Demo data error:',
      error
    );

    alert(
      'Could not load demo data. Check data/sample-orders.json.'
    );
  }
}


// =====================================================================
// AGGREGATION
// =====================================================================

function computeStats() {

  const totalOrders =
    ORDERS.length;


  const amounts =
    ORDERS
      .map(
        o => Number(o.amount)
      )
      .filter(
        a =>
          Number.isFinite(a) &&
          a > 0
      );


  const totalSales =
    amounts.reduce(
      (a, b) => a + b,
      0
    );


  const aov =
    amounts.length
      ? totalSales /
        amounts.length
      : 0;


  const cod =
    ORDERS.filter(
      o =>
        o.paymentType ===
        'Cash (COD)'
    ).length;


  const prepaid =
    ORDERS.filter(
      o =>
        o.paymentType ===
        'Prepaid'
    ).length;


  return {
    totalOrders,
    totalSales,
    aov,
    cod,
    prepaid
  };
}


function groupBy(
  arr,
  keyFn
) {

  const map = {};


  arr.forEach(item => {

    const key =
      keyFn(item) ||
      'Unknown';


    map[key] =
      (map[key] || 0) +
      1;

  });


  return map;
}


function getGenderCounts() {

  const counts = {
    Female: 0,
    Male: 0,
    Unknown: 0
  };


  ORDERS.forEach(order => {

    const gender = normalizeGender(
      order.detectedGender ??
      order.gender
    );


    counts[gender]++;
  });


  return counts;
}


// =====================================================================
// RENDER EVERYTHING
// =====================================================================

function renderEverything() {

  const emptyNotice =
    document.getElementById(
      'emptyNotice'
    );


  const dataSections =
    document.getElementById(
      'dataSections'
    );


  if (emptyNotice) {
    emptyNotice.style.display =
      ORDERS.length
        ? 'none'
        : 'block';
  }


  if (dataSections) {
    dataSections.style.display =
      ORDERS.length
        ? 'block'
        : 'none';
  }


  if (!ORDERS.length) {
    return;
  }


  renderStatRow();

  renderMarketplaceChart();

  renderRegionChart();

  renderCityChart();

  renderGenderChart();

  renderPaymentChart();

  renderDailyChart();

  renderProductCharts();

  renderTable();
}


// =====================================================================
// STAT ROW
// =====================================================================

function renderStatRow() {

  const s =
    computeStats();


  const statRow =
    document.getElementById(
      'statRow'
    );


  if (!statRow) return;


  statRow.innerHTML = `

    <div class="stat-card">

      <span class="label">
        Total orders
      </span>

      <div class="value">
        ${s.totalOrders.toLocaleString(
          'en-IN'
        )}
      </div>

      <span class="sub">
        from ${
          new Set(
            ORDERS.map(
              o =>
                o.marketplace
            )
          ).size
        } marketplace(s)
      </span>

    </div>


    <div class="stat-card">

      <span class="label">
        Total sales
      </span>

      <div class="value">
        ₹${Math.round(
          s.totalSales
        ).toLocaleString(
          'en-IN'
        )}
      </div>

      <span class="sub">
        from orders with a readable amount
      </span>

    </div>


    <div class="stat-card">

      <span class="label">
        Avg. order value
      </span>

      <div class="value">
        ₹${Math.round(
          s.aov
        ).toLocaleString(
          'en-IN'
        )}
      </div>

      <span class="sub">
        across all parsed orders
      </span>

    </div>


    <div class="stat-card">

      <span class="label">
        Payment split
      </span>

      <div class="value">
        ${s.cod} COD /
        ${s.prepaid} Prepaid
      </div>

      <span class="sub">
        ${
          ORDERS.length -
          s.cod -
          s.prepaid
        }
        not specified on label
      </span>

    </div>

  `;
}


// =====================================================================
// CHART HELPERS
// =====================================================================

function destroyChart(id) {

  if (charts[id]) {

    charts[id].destroy();

    delete charts[id];
  }
}


function themeVars() {

  const light =
    document.documentElement
      .getAttribute(
        'data-theme'
      ) === 'light';


  return {

    text:
      light
        ? '#625C4C'
        : '#8C90A8',

    grid:
      light
        ? 'rgba(20,18,10,0.08)'
        : 'rgba(255,255,255,0.06)'
  };
}


function formatPercentage(
  value,
  total
) {

  return total
    ? `${(
        (Number(value) /
          total) *
        100
      ).toFixed(1)}%`
    : '0%';
}


function chartValueLabel(
  item,
  total,
  unit,
  includeName = false
) {

  const name =
    includeName &&
    item.label
      ? `${item.label}: `
      : '';


  return `
    ${name}
    ${Number(item.raw).toLocaleString(
      'en-IN'
    )}
    ${unit}
    (${formatPercentage(
      item.raw,
      total
    )})
  `;
}


// =====================================================================
// MARKETPLACE CHART
// =====================================================================

function renderMarketplaceChart() {

  destroyChart(
    'marketplace'
  );


  const grouped =
    groupBy(
      ORDERS,
      o => o.marketplace
    );


  const total =
    Object.values(
      grouped
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'marketplaceChart'
    );


  if (!canvas) return;


  charts.marketplace =
    new Chart(
      canvas,
      {
        type: 'doughnut',

        data: {

          labels:
            Object.keys(
              grouped
            ),

          datasets: [

            {

              data:
                Object.values(
                  grouped
                ),

              backgroundColor: [
                COLORS.marigold,
                COLORS.teal,
                COLORS.violet,
                COLORS.coral,
                COLORS.blue
              ],

              borderWidth: 0
            }

          ]
        },

        options: {

          cutout: '68%',

          plugins: {

            legend: {

              position: 'bottom',

              labels: {
                color:
                  tv.text,

                boxWidth: 8,

                padding: 14
              }
            },

            tooltip: {

              callbacks: {

                label:
                  item =>
                    chartValueLabel(
                      item,
                      total,
                      'orders',
                      true
                    )
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// REGION CHART
// =====================================================================

function renderRegionChart() {

  destroyChart('region');


  const grouped =
    groupBy(
      ORDERS,
      o => o.state
    );


  const entries =
    Object.entries(
      grouped
    )
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 8);


  const total =
    ORDERS.length;


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'regionChart'
    );


  if (!canvas) return;


  charts.region =
    new Chart(
      canvas,
      {
        type: 'bar',

        data: {

          labels:
            entries.map(
              e => e[0]
            ),

          datasets: [

            {

              data:
                entries.map(
                  e => e[1]
                ),

              backgroundColor:
                COLORS.teal,

              borderRadius: 5,

              maxBarThickness: 30
            }

          ]
        },

        options: {

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label:
                  item =>
                    chartValueLabel(
                      item,
                      total,
                      'orders'
                    )
              }
            }
          },

          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {

                color:
                  tv.text,

                maxRotation: 45,

                minRotation: 0
              }
            },

            y: {

              beginAtZero: true,

              grid: {
                color:
                  tv.grid
              },

              ticks: {

                color:
                  tv.text,

                precision: 0,

                stepSize: 2,

                callback:
                  value =>
                    Number.isInteger(
                      Number(value)
                    )
                      ? value
                      : ''
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// CITY CHART
// =====================================================================

function renderCityChart() {

  destroyChart('city');


  const grouped =
    groupBy(
      ORDERS,
      o => o.city
    );


  const entries =
    Object.entries(
      grouped
    )
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(0, 8);


  const total =
    ORDERS.length;


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'cityChart'
    );


  if (!canvas) return;


  charts.city =
    new Chart(
      canvas,
      {
        type: 'bar',

        data: {

          labels:
            entries.map(
              e => e[0]
            ),

          datasets: [

            {

              data:
                entries.map(
                  e => e[1]
                ),

              backgroundColor:
                COLORS.violet,

              borderRadius: 5,

              maxBarThickness: 30
            }

          ]
        },

        options: {

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label:
                  item =>
                    chartValueLabel(
                      item,
                      total,
                      'orders'
                    )
              }
            }
          },

          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {

                color:
                  tv.text,

                maxRotation: 45,

                minRotation: 0
              }
            },

            y: {

              beginAtZero: true,

              grid: {
                color:
                  tv.grid
              },

              ticks: {

                color:
                  tv.text,

                precision: 0,

                stepSize: 2,

                callback:
                  value =>
                    Number.isInteger(
                      Number(value)
                    )
                      ? value
                      : ''
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// ⭐ GENDER CHART — FINAL CORRECTED VERSION
// =====================================================================

function renderGenderChart() {

  destroyChart('gender');


  /*
   * ================================================================
   * SOURCE OF TRUTH
   * ================================================================
   *
   * The chart uses detectedGender.
   *
   * It NEVER uses selectedGender.
   *
   * Therefore:
   *
   * Receipt = Male
   *
   * Female dropdown selection
   *        ↓
   * selectedGender = Female
   *
   * BUT:
   *
   * detectedGender = Male
   *
   * Therefore chart remains:
   *
   * Male = 100%
   * Female = 0%
   * Unknown = 0%
   *
   * ================================================================
   */


  const genderCounts = getGenderCounts();


  const labels = [
    'Female',
    'Male',
    'Unknown'
  ];


  /*
   * These are the REAL values.
   *
   * Example:
   *
   * Male receipt:
   *
   * [0, 1, 0]
   */

  const realValues = [

    genderCounts.Female,

    genderCounts.Male,

    genderCounts.Unknown

  ];


  const total =
    ORDERS.length;


  /*
   * Chart.js doesn't create an arc for value 0.
   *
   * We want the zero categories to still have
   * a tiny grey hoverable area.
   *
   * Therefore we give zero values a microscopic
   * visual value.
   *
   * IMPORTANT:
   *
   * Tooltip still uses realValues,
   * so it displays:
   *
   * Female: 0 orders (0.0%)
   *
   * instead of the tiny visual value.
   */

  const displayValues =
    realValues.map(
      value =>
        value === 0
          ? 0.000001
          : value
    );


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'genderChart'
    );


  if (!canvas) return;


  charts.gender =
    new Chart(
      canvas,
      {

        type: 'doughnut',


        data: {

          labels: labels,


          datasets: [

            {

              /*
               * Use displayValues for drawing.
               */

              data:
                displayValues,


              /*
              * Female: white when present, grey when zero.
              * Male: orange when present, grey when zero.
               *
               * Unknown:
               * grey
               */

              backgroundColor: [

                realValues[0] > 0
                  ? COLORS.genderFemale
                  : COLORS.grey1,

                realValues[1] > 0
                  ? COLORS.genderMale
                  : COLORS.grey1,

                realValues[2] > 0
                  ? COLORS.grey2
                  : COLORS.grey2

              ],


              borderWidth: 1,

              borderColor: tv.grid

            }

          ]
        },


        options: {

          cutout: '68%',


          plugins: {

            legend: {

              position:
                'bottom',


              labels: {

                color:
                  tv.text,

                boxWidth: 8,

                padding: 14
              }
            },


            tooltip: {

              callbacks: {

                /*
                 * IMPORTANT:
                 *
                 * Do NOT use item.raw here.
                 *
                 * item.raw contains the tiny visual
                 * value for zero categories.
                 *
                 * We instead use realValues.
                 */

                label:
                  item => {

                    const index =
                      item.dataIndex;


                    const realValue =
                      realValues[index];


                    const label =
                      labels[index];


                    return `
                      ${label}:
                      ${realValue}
                      orders
                      (${formatPercentage(
                        realValue,
                        total
                      )})
                    `;
                  }
              }
            }
          }
        }
      }
    );


  const summary = document.getElementById('genderSummary');


  if (summary) {

    const total = ORDERS.length;

    summary.innerHTML = [
      ['Male', genderCounts.Male, COLORS.genderMale],
      ['Female', genderCounts.Female, COLORS.genderFemale],
      ['Unknown', genderCounts.Unknown, COLORS.grey1]
    ]
      .map(([label, count, color]) => `
        <span class="gender-summary-item">
          <i class="gender-summary-swatch" style="--gender-color:${color}"></i>
          <span>${label}: ${count} (${formatPercentage(count, total)})</span>
        </span>
      `)
      .join('');
  }
}


// =====================================================================
// PAYMENT CHART
// =====================================================================

function renderPaymentChart() {

  destroyChart('payment');


  const grouped =
    groupBy(
      ORDERS,
      o => o.paymentType
    );


  const total =
    Object.values(
      grouped
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'paymentChart'
    );


  if (!canvas) return;


  charts.payment =
    new Chart(
      canvas,
      {

        type: 'doughnut',


        data: {

          labels:
            Object.keys(
              grouped
            ),


          datasets: [

            {

              data:
                Object.values(
                  grouped
                ),

              backgroundColor: [

                COLORS.coral,

                COLORS.teal,

                COLORS.grid

              ],

              borderWidth: 0
            }

          ]
        },


        options: {

          cutout: '68%',


          plugins: {

            legend: {

              position:
                'bottom',

              labels: {

                color:
                  tv.text,

                boxWidth: 8,

                padding: 14
              }
            },


            tooltip: {

              callbacks: {

                label:
                  item =>
                    chartValueLabel(
                      item,
                      total,
                      'orders',
                      true
                    )
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// DATE PARSER
// =====================================================================

function parseOrderDate(
  value
) {

  if (!value) return null;


  const match =
    String(value)
      .trim()
      .match(
        /^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/
      );


  if (!match) return null;


  const day =
    parseInt(
      match[1],
      10
    );


  const month =
    parseInt(
      match[2],
      10
    );


  let year =
    parseInt(
      match[3],
      10
    );


  if (year < 100) {
    year += 2000;
  }


  const date =
    new Date(
      year,
      month - 1,
      day
    );


  // ------------------------------------------------------------------
  // FIX: `return` must be on the same statement as the value it
  // returns. A bare `return` followed by a newline triggers
  // JavaScript's Automatic Semicolon Insertion, which silently turns
  // this into `return;` (always undefined) and breaks every date
  // this function is asked to parse. Wrapping in parentheses keeps
  // the expression attached to `return`.
  // ------------------------------------------------------------------
  return (

    date.getFullYear() ===
      year &&

    date.getMonth() ===
      month - 1 &&

    date.getDate() ===
      day

      ? date
      : null
  );
}


// =====================================================================
// DAILY CHART
// =====================================================================

function renderDailyChart() {

  destroyChart('daily');


  const metric =
    document.getElementById(
      'dailyChartMetric'
    )?.value ||
    'orders';


  const grouped =
    new Map();


  ORDERS.forEach(
    order => {

      const date =
        parseOrderDate(
          order.date
        );


      if (!date) return;


      const key =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(
          2,
          '0'
        )}-${String(
          date.getDate()
        ).padStart(
          2,
          '0'
        )}`;


      const value =
        metric === 'sales'
          ? Number(
              order.amount
            ) || 0
          : 1;


      grouped.set(
        key,
        (
          grouped.get(key) ||
          0
        ) + value
      );

    }
  );


  const dates =
    [
      ...grouped.keys()
    ].sort();


  const counts =
    dates.map(
      date =>
        grouped.get(date)
    );


  const total =
    counts.reduce(
      (sum, value) =>
        sum + value,
      0
    );


  const tv =
    themeVars();


  const canvas =
    document.getElementById(
      'dailyChart'
    );


  if (!canvas) return;


  const card =
    canvas.closest(
      '.chart-card'
    );


  let note =
    card?.querySelector(
      '.empty-note-inline'
    );


  if (!counts.length) {

    if (!note && card) {

      note =
        document.createElement(
          'p'
        );


      note.className =
        'empty-note-inline';


      note.style.cssText =
        'font-size:12.5px;color:var(--text-faint);text-align:center;padding:20px 0;';


      note.textContent =
        'None of your uploaded labels contained a readable order date.';


      card.appendChild(
        note
      );
    }

  } else if (note) {

    note.remove();
  }


  charts.daily =
    new Chart(
      canvas,
      {

        type: 'line',


        data: {

          labels:
            dates.map(
              date =>
                new Date(
                  `${date}T00:00:00`
                ).toLocaleDateString(
                  'en-IN',
                  {
                    day:
                      'numeric',

                    month:
                      'short'
                  }
                )
            ),


          datasets: [

            {

              data:
                counts,

              label:
                metric === 'sales'
                  ? 'Sales'
                  : 'Orders',

              borderColor:
                COLORS.marigold,

              backgroundColor:
                'rgba(193,68,58,0.16)',

              pointBackgroundColor:
                COLORS.marigold,

              pointBorderColor:
                COLORS.marigold,

              pointRadius: 4,

              pointHoverRadius: 6,

              borderWidth: 2,

              tension: 0.25,

              fill: true
            }

          ]
        },


        options: {

          plugins: {

            legend: {
              display: false
            },


            tooltip: {

              callbacks: {

                title:
                  items =>
                    new Date(
                      `${dates[
                        items[0]
                          .dataIndex
                      ]}T00:00:00`
                    ).toLocaleDateString(
                      'en-IN',
                      {
                        day:
                          'numeric',

                        month:
                          'long',

                        year:
                          'numeric'
                      }
                    ),


                label:
                  item =>
                    metric === 'sales'

                      ? ` Sales: ₹${item.raw.toLocaleString(
                          'en-IN'
                        )} (${formatPercentage(
                          item.raw,
                          total
                        )})`

                      : ` Orders: ${
                          item.raw
                        } (${formatPercentage(
                          item.raw,
                          total
                        )})`
              }
            }
          },


          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {

                color:
                  tv.text,

                maxTicksLimit:
                  10
              }
            },


            y: {

              grid: {
                color:
                  tv.grid
              },

              ticks: {

                color:
                  tv.text,

                precision: 0,

                callback:
                  value =>
                    metric ===
                    'sales'

                      ? `₹${Number(
                          value
                        ).toLocaleString(
                          'en-IN'
                        )}`

                      : value
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// CHART NOTE
// =====================================================================

function addChartNote(
  card,
  message
) {

  if (!card) return;


  let note =
    card.querySelector(
      '.empty-note-inline'
    );


  if (!note) {

    note =
      document.createElement(
        'p'
      );


    note.className =
      'empty-note-inline';


    note.style.cssText =
      'font-size:12.5px;color:var(--text-faint);text-align:center;padding:20px 0;';


    card.appendChild(
      note
    );
  }


  note.textContent =
    message;
}


// =====================================================================
// PRODUCT CHARTS
// =====================================================================

function renderProductCharts() {

  destroyChart('product');

  destroyChart(
    'categoryRegion'
  );


  const productTotals =
    new Map();


  const categoryRegions =
    new Map();


  ORDERS.forEach(
    order => {

      if (!order.productName) {
        return;
      }


      const quantity =
        Number(
          order.quantity
        ) || 1;


      productTotals.set(
        order.productName,

        (
          productTotals.get(
            order.productName
          ) || 0
        ) + quantity
      );


      const category =
        order.category ||
        'Other';


      const region =
        order.state ||
        'Unknown';


      if (
        !categoryRegions.has(
          category
        )
      ) {

        categoryRegions.set(
          category,
          new Map()
        );
      }


      const regions =
        categoryRegions.get(
          category
        );


      regions.set(
        region,

        (
          regions.get(
            region
          ) || 0
        ) + quantity
      );

    }
  );


  const productEntries =
    [
      ...productTotals.entries()
    ]
      .sort(
        (a, b) =>
          b[1] - a[1]
      )
      .slice(
        0,
        10
      );


  const productTotal =
    [
      ...productTotals.values()
    ].reduce(
      (sum, value) =>
        sum + value,
      0
    );


  const categoryEntries =
    [
      ...categoryRegions.entries()
    ]
      .map(
        ([category, regions]) => {

          const [
            region,
            quantity
          ] =
            [
              ...regions.entries()
            ]
              .sort(
                (a, b) =>
                  b[1] - a[1]
              )[0];


          return {

            label:
              `${category} — ${region}`,

            quantity
          };
        }
      )
      .sort(
        (a, b) =>
          b.quantity -
          a.quantity
      );


  const categoryTotal =
    categoryEntries.reduce(
      (sum, entry) =>
        sum + entry.quantity,
      0
    );


  const tv =
    themeVars();


  const productCanvas =
    document.getElementById(
      'productChart'
    );


  const categoryCanvas =
    document.getElementById(
      'categoryRegionChart'
    );


  if (
    !productCanvas ||
    !categoryCanvas
  ) {
    return;
  }


  const productCard =
    productCanvas.closest(
      '.chart-card'
    );


  const categoryCard =
    categoryCanvas.closest(
      '.chart-card'
    );


  productCard
    ?.querySelector(
      '.empty-note-inline'
    )
    ?.remove();


  categoryCard
    ?.querySelector(
      '.empty-note-inline'
    )
    ?.remove();


  if (
    !productEntries.length
  ) {

    addChartNote(
      productCard,
      'No readable product names were found on these bills.'
    );
  }


  if (
    !categoryEntries.length
  ) {

    addChartNote(
      categoryCard,
      'Category demand appears when bills include a product name.'
    );
  }


  charts.product =
    new Chart(
      productCanvas,
      {

        type: 'bar',


        data: {

          labels:
            productEntries.map(
              entry =>
                entry[0]
            ),


          datasets: [

            {

              data:
                productEntries.map(
                  entry =>
                    entry[1]
                ),

              backgroundColor:
                COLORS.marigold,

              borderRadius: 5,

              maxBarThickness: 30
            }

          ]
        },


        options: {

          plugins: {

            legend: {
              display: false
            },


            tooltip: {

              callbacks: {

                label:
                  item =>
                    chartValueLabel(
                      item,
                      productTotal,
                      'units'
                    )
              }
            }
          },


          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {

                color:
                  tv.text,

                maxRotation:
                  45,

                minRotation:
                  0
              }
            },


            y: {

              beginAtZero: true,

              grid: {
                color:
                  tv.grid
              },

              ticks: {

                color:
                  tv.text,

                precision: 0,

                stepSize: 2,

                callback:
                  value =>
                    Number.isInteger(
                      Number(value)
                    )
                      ? value
                      : ''
              }
            }
          }
        }
      }
    );


  charts.categoryRegion =
    new Chart(
      categoryCanvas,
      {

        type: 'bar',


        data: {

          labels:
            categoryEntries.map(
              entry =>
                entry.label
            ),


          datasets: [

            {

              data:
                categoryEntries.map(
                  entry =>
                    entry.quantity
                ),

              backgroundColor:
                COLORS.teal,

              borderRadius: 5,

              maxBarThickness: 30
            }

          ]
        },


        options: {

          plugins: {

            legend: {
              display: false
            },


            tooltip: {

              callbacks: {

                label:
                  item =>
                    ` ${item.raw} units demanded in the top region (${formatPercentage(
                      item.raw,
                      categoryTotal
                    )})`
              }
            }
          },


          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {

                color:
                  tv.text,

                maxRotation:
                  45,

                minRotation:
                  0
              }
            },


            y: {

              beginAtZero: true,

              grid: {
                color:
                  tv.grid
              },

              ticks: {

                color:
                  tv.text,

                precision: 0,

                stepSize: 2,

                callback:
                  value =>
                    Number.isInteger(
                      Number(value)
                    )
                      ? value
                      : ''
              }
            }
          }
        }
      }
    );
}


// =====================================================================
// TABLE
// =====================================================================

function renderTable() {

  const tbody =
    document.getElementById(
      'ordersTableBody'
    );


  if (!tbody) return;


  tbody.innerHTML =
    ORDERS
      .slice(
        0,
        50
      )
      .map(
        o => {

          /*
           * Dropdown shows selectedGender.
           *
           * This can differ from detectedGender.
           *
           * Example:
           *
           * detectedGender = Male
           * selectedGender = Female
           *
           * Chart still uses Male.
           */

          const selectedGender =
            normalizeGender(
              o.selectedGender ??
              o.detectedGender ??
              o.gender
            );


          return `

            <tr>

              <td class="mk">
                ${o.marketplace}
              </td>


              <td>

                <button
                  class="order-id-toggle"
                  type="button"
                  data-order-id="${o.orderId}"
                  aria-label="Show full order ID ${o.orderId}"
                >

                  ${
                    o.orderId.length > 14

                      ? `${o.orderId.slice(
                          0,
                          10
                        )}…${o.orderId.slice(
                          -4
                        )}`

                      : o.orderId
                  }

                </button>

              </td>


              <td>

                ${
                  o.amount

                    ? '₹' +
                      Number(
                        o.amount
                      ).toLocaleString(
                        'en-IN'
                      )

                    : '—'
                }

              </td>


              <td>

                <span
                  class="badge ${
                    o.paymentType ===
                    'Cash (COD)'
                      ? 'cod'
                      : 'prepaid'
                  }"
                >

                  ${
                    o.paymentType ||
                    'Not specified'
                  }

                </span>

              </td>


              <td>
                ${o.state}
              </td>


              <td>
                ${o.city}
              </td>


              <td>
                ${
                  o.productName ||
                  '—'
                }
              </td>


              <td>
                ${
                  o.quantity ||
                  '—'
                }
              </td>


              <td>
                ${
                  o.category ||
                  '—'
                }
              </td>


              <td>

                <select
                  class="gender-select"
                  data-order-index="${ORDERS.indexOf(o)}"
                  aria-label="Gender estimate for ${
                    o.customerName ||
                    'order'
                  }"
                >

                  <option
                    value="Unknown"
                    ${
                      selectedGender ===
                      'Unknown'
                        ? 'selected'
                        : ''
                    }
                  >
                    Unknown
                  </option>


                  <option
                    value="Female"
                    ${
                      selectedGender ===
                      'Female'
                        ? 'selected'
                        : ''
                    }
                  >
                    Female
                  </option>


                  <option
                    value="Male"
                    ${
                      selectedGender ===
                      'Male'
                        ? 'selected'
                        : ''
                    }
                  >
                    Male
                  </option>

                </select>

              </td>


              <td>
                ${
                  o.date ||
                  '—'
                }
              </td>

            </tr>

          `;

        }
      )
      .join('');


  const tableCount =
    document.getElementById(
      'tableCount'
    );


  if (tableCount) {

    tableCount.textContent =
      `Showing ${
        Math.min(
          50,
          ORDERS.length
        )
      } of ${
        ORDERS.length
      }`;
  }
}


// =====================================================================
// REDRAW
// =====================================================================

function redrawCharts() {

  if (ORDERS.length) {
    renderEverything();
  }
}


// =====================================================================
// EXPORT CSV
// =====================================================================

function exportCSV() {

  const headers = [

    'marketplace',
    'orderId',
    'orderIdSource',
    'amount',
    'paymentType',
    'paymentMethod',
    'state',
    'city',
    'pin',
    'gender',
    'productName',
    'quantity',
    'category',
    'date',
    'time'

  ];


  const rows =
    ORDERS.map(
      o =>
        headers
          .map(
            h =>
              `"${(
                o[h] ??
                ''
              )
                .toString()
                .replace(
                  /"/g,
                  '""'
                )}"`
          )
          .join(',')
    );


  const csv =
    [
      headers.join(','),
      ...rows
    ].join('\n');


  downloadBlob(
    csv,
    'vyapar-vision-export.csv',
    'text/csv'
  );
}


// =====================================================================
// EXPORT JSON
// =====================================================================

function exportJSON() {

  downloadBlob(

    JSON.stringify(
      ORDERS,
      null,
      2
    ),

    'vyapar-vision-export.json',

    'application/json'

  );
}


// =====================================================================
// EXPORT XLSX
// =====================================================================

function exportXLSX() {

  const ws =
    XLSX.utils.json_to_sheet(
      ORDERS
    );


  const wb =
    XLSX.utils.book_new();


  XLSX.utils.book_append_sheet(
    wb,
    ws,
    'Orders'
  );


  XLSX.writeFile(
    wb,
    'vyapar-vision-export.xlsx'
  );
}


// =====================================================================
// EXPORT JPG
// =====================================================================

async function exportJPG() {

  const target =
    document.getElementById(
      'dataSections'
    );


  if (!target) return;


  const canvas =
    await html2canvas(
      target,
      {
        backgroundColor:
          getComputedStyle(
            document.body
          ).backgroundColor
      }
    );


  const link =
    document.createElement(
      'a'
    );


  link.download =
    'vyapar-vision-dashboard.jpg';


  link.href =
    canvas.toDataURL(
      'image/jpeg',
      0.92
    );


  link.click();
}


// =====================================================================
// EXPORT PDF
// =====================================================================

async function exportPDF() {

  const target =
    document.getElementById(
      'dataSections'
    );


  if (!target) return;


  const canvas =
    await html2canvas(
      target,
      {
        backgroundColor:
          getComputedStyle(
            document.body
          ).backgroundColor
      }
    );


  const {
    jsPDF
  } =
    window.jspdf;


  const pdf =
    new jsPDF(
      'p',
      'pt',
      [
        canvas.width,
        canvas.height
      ]
    );


  pdf.addImage(

    canvas.toDataURL(
      'image/png'
    ),

    'PNG',

    0,

    0,

    canvas.width,

    canvas.height

  );


  pdf.save(
    'vyapar-vision-dashboard.pdf'
  );
}


// =====================================================================
// DOWNLOAD HELPER
// =====================================================================

function downloadBlob(
  content,
  filename,
  type
) {

  const blob =
    new Blob(
      [content],
      { type }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    filename;


  link.click();


  URL.revokeObjectURL(
    url
  );
}


// =====================================================================
// INITIALIZATION
// =====================================================================

document.addEventListener(
  'DOMContentLoaded',
  () => {

    // ---------------------------------------------------------------
    // Drop zone
    // ---------------------------------------------------------------

    setupDropZone();


    // ---------------------------------------------------------------
    // Demo button
    // ---------------------------------------------------------------

    const demoBtn =
      document.getElementById(
        'demoBtn'
      );


    if (demoBtn) {

      demoBtn.addEventListener(
        'click',
        loadDemoData
      );

    }


    // ---------------------------------------------------------------
    // Daily chart
    // ---------------------------------------------------------------

    const dailyMetric =
      document.getElementById(
        'dailyChartMetric'
      );


    if (dailyMetric) {

      dailyMetric.addEventListener(
        'change',
        renderDailyChart
      );

    }


    // ---------------------------------------------------------------
    // ⭐ GENDER DROPDOWN
    // ---------------------------------------------------------------

    const ordersTableBody =
      document.getElementById(
        'ordersTableBody'
      );


    if (ordersTableBody) {

      ordersTableBody.addEventListener(
        'change',
        event => {

          if (
            !event.target.matches(
              '.gender-select'
            )
          ) {
            return;
          }


          const index =
            Number(
              event.target.dataset
                .orderIndex
            );


          if (
            !Number.isInteger(
              index
            ) ||
            !ORDERS[index]
          ) {
            return;
          }


          /*
           * =========================================================
           * IMPORTANT
           * =========================================================
           *
           * ONLY change selectedGender.
           *
           * NEVER change:
           *
           *     detectedGender
           *
           * or:
           *
           *     gender
           *
           * because those represent what was detected from
           * the uploaded receipt.
           */

          ORDERS[index]
            .selectedGender =
            normalizeGender(
              event.target.value
            );


          /*
           * DO NOT call renderGenderChart().
           *
           * The chart represents the receipt's detected gender.
           *
           * Example:
           *
           * Receipt:
           * Male
           *
           * Dropdown:
           * Female
           *
           * Chart:
           * Male = 100%
           * Female = 0%
           */

        }
      );


      // -------------------------------------------------------------
      // Order ID expand / collapse
      // -------------------------------------------------------------

      ordersTableBody.addEventListener(
        'click',
        event => {

          const button =
            event.target.closest(
              '.order-id-toggle'
            );


          if (!button) {
            return;
          }


          const expanded =
            button.classList.toggle(
              'expanded'
            );


          const orderId =
            button.dataset
              .orderId;


          button.textContent =
            expanded

              ? orderId

              : (
                  orderId.length > 14

                    ? `${orderId.slice(
                        0,
                        10
                      )}…${orderId.slice(
                        -4
                      )}`

                    : orderId
                );


          button.setAttribute(

            'aria-label',

            expanded

              ? `Hide full order ID ${orderId}`

              : `Show full order ID ${orderId}`

          );

        }
      );

    }


    // ---------------------------------------------------------------
    // Export buttons
    // ---------------------------------------------------------------

    const exportCsv =
      document.getElementById(
        'exportCsv'
      );


    if (exportCsv) {

      exportCsv.addEventListener(
        'click',
        exportCSV
      );

    }


    const exportJson =
      document.getElementById(
        'exportJson'
      );


    if (exportJson) {

      exportJson.addEventListener(
        'click',
        exportJSON
      );

    }


    const exportXlsx =
      document.getElementById(
        'exportXlsx'
      );


    if (exportXlsx) {

      exportXlsx.addEventListener(
        'click',
        exportXLSX
      );

    }


    const exportJpg =
      document.getElementById(
        'exportJpg'
      );


    if (exportJpg) {

      exportJpg.addEventListener(
        'click',
        exportJPG
      );

    }


    const exportPdf =
      document.getElementById(
        'exportPdf'
      );


    if (exportPdf) {

      exportPdf.addEventListener(
        'click',
        exportPDF
      );

    }


    // ---------------------------------------------------------------
    // PDF.js check
    // ---------------------------------------------------------------

    if (
      typeof pdfjsLib ===
      'undefined'
    ) {

      const zone =
        document.getElementById(
          'dropZone'
        );


      if (zone) {

        zone.innerHTML = `

          <h4
            style="color:var(--coral)"
          >
            PDF reader failed to load
          </h4>

          <p>
            Check your internet connection
            and refresh — this app loads
            pdf.js from a CDN and needs
            that to succeed once per visit.
          </p>

        `;

      }

    }

  }
);