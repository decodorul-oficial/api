/**
 * Exemplu de utilizare a API-ului de Analitice
 * Demonstrează cum să utilizezi query-ul getAnalyticsDashboard pentru obținerea datelor pentru dashboard
 */

// Exemplu de query GraphQL pentru obținerea tuturor datelor de analitice
const ANALYTICS_DASHBOARD_QUERY = `
  query GetAnalyticsDashboard($startDate: String!, $endDate: String!) {
    getAnalyticsDashboard(startDate: $startDate, endDate: $endDate) {
      totalActs
      legislativeActivityOverTime {
        date
        value
      }
      topActiveMinistries {
        label
        value
      }
      distributionByCategory {
        label
        value
      }
      topKeywords {
        label
        value
      }
      topMentionedLaws {
        label
        value
      }
    }
  }
`;

// Exemplu de variabile pentru query
const variables = {
  startDate: "2024-01-01",  // Format YYYY-MM-DD
  endDate: "2024-12-31"     // Format YYYY-MM-DD
};

// Exemplu de request HTTP
async function fetchAnalyticsDashboard() {
  try {
    const response = await fetch('https://your-api-domain.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
      },
      body: JSON.stringify({
        query: ANALYTICS_DASHBOARD_QUERY,
        variables: variables
      })
    });

    const { data, errors } = await response.json();
    
    if (errors) {
      console.error('GraphQL Errors:', errors);
      return;
    }

    const analytics = data.getAnalyticsDashboard;
    console.log('Analytics Dashboard Data:', analytics);
    
    // Procesează datele pentru grafice
    processAnalyticsData(analytics);
    
  } catch (error) {
    console.error('Request Error:', error);
  }
}

// Funcție pentru procesarea datelor de analitice
function processAnalyticsData(analytics) {
  console.log('=== ANALYTICS DASHBOARD ===');
  
  // 1. Afișează numărul total de acte
  console.log(`Total Acte Normative: ${analytics.totalActs}`);
  
  // 2. Procesează activitatea legislativă în timp pentru un grafic linie
  console.log('\n--- Activitate Legislativă în Timp ---');
  const timeData = analytics.legislativeActivityOverTime;
  console.log('Date pentru grafic linie:', timeData);
  
  // Pentru Chart.js sau alte librării
  const chartTimeData = {
    labels: timeData.map(item => item.date),
    datasets: [{
      label: 'Acte Publicate',
      data: timeData.map(item => item.value),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1
    }]
  };
  
  // 3. Procesează top ministere pentru grafic bară
  console.log('\n--- Top 5 Ministere Active ---');
  const ministriesData = analytics.topActiveMinistries;
  console.log('Date pentru grafic bară:', ministriesData);
  
  // Pentru Chart.js sau alte librării
  const chartMinistriesData = {
    labels: ministriesData.map(item => item.label),
    datasets: [{
      label: 'Număr Acte',
      data: ministriesData.map(item => item.value),
      backgroundColor: [
        'rgba(255, 99, 132, 0.2)',
        'rgba(54, 162, 235, 0.2)',
        'rgba(255, 205, 86, 0.2)',
        'rgba(75, 192, 192, 0.2)',
        'rgba(153, 102, 255, 0.2)'
      ]
    }]
  };
  
  // 4. Procesează distribuția pe categorii pentru pie chart
  console.log('\n--- Distribuție pe Categorii ---');
  const categoriesData = analytics.distributionByCategory;
  console.log('Date pentru pie chart:', categoriesData);
  
  // 5. Procesează top cuvinte cheie pentru word cloud
  console.log('\n--- Top 10 Cuvinte Cheie ---');
  const keywordsData = analytics.topKeywords;
  console.log('Date pentru word cloud:', keywordsData);
  
  // 6. Procesează actele cele mai menționate
  console.log('\n--- Top 10 Acte Menționate ---');
  const lawsData = analytics.topMentionedLaws;
  console.log('Date pentru listă/grafic:', lawsData);
  
  return {
    totalActs: analytics.totalActs,
    timeChart: chartTimeData,
    ministriesChart: chartMinistriesData,
    categoriesChart: {
      labels: categoriesData.map(item => item.label),
      datasets: [{
        data: categoriesData.map(item => item.value),
        backgroundColor: generateColors(categoriesData.length)
      }]
    },
    keywords: keywordsData,
    laws: lawsData
  };
}

// Funcție helper pentru generarea culorilor
function generateColors(count) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * 360) / count;
    colors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
  }
  return colors;
}

// Exemplu pentru React/Vue/Angular - Hook/Composable pentru analytics
class AnalyticsDashboard {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  async fetchDashboardData(startDate, endDate) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        query: ANALYTICS_DASHBOARD_QUERY,
        variables: { startDate, endDate }
      })
    });

    const { data, errors } = await response.json();
    
    if (errors) {
      throw new Error(`GraphQL Error: ${errors.map(e => e.message).join(', ')}`);
    }

    return data.getAnalyticsDashboard;
  }

  // Metodă pentru obținerea datelor ultimelor 30 de zile
  async getLastMonthAnalytics() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return this.fetchDashboardData(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }

  // Metodă pentru obținerea datelor ultimului an
  async getLastYearAnalytics() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    return this.fetchDashboardData(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }

  // Metodă pentru obținerea datelor pentru un an specific
  async getYearAnalytics(year) {
    return this.fetchDashboardData(
      `${year}-01-01`,
      `${year}-12-31`
    );
  }
}

// Exemplu de utilizare
async function exempleUtilizare() {
  const dashboard = new AnalyticsDashboard('https://your-api.com/graphql', 'YOUR_TOKEN');
  
  try {
    // Obține datele pentru ultimele 30 de zile
    const lastMonth = await dashboard.getLastMonthAnalytics();
    console.log('Analytics pentru ultimele 30 de zile:', lastMonth);
    
    // Obține datele pentru anul 2024
    const year2024 = await dashboard.getYearAnalytics(2024);
    console.log('Analytics pentru 2024:', year2024);
    
  } catch (error) {
    console.error('Eroare la obținerea analiticelor:', error);
  }
}

// Validare intervale de date
function validateDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Date invalide furnizate');
  }
  
  if (start > end) {
    throw new Error('Data de început trebuie să fie înainte de data de sfârșit');
  }
  
  // Verifică că intervalul nu este mai mare de 2 ani
  const maxDays = 2 * 365;
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > maxDays) {
    throw new Error('Intervalul de timp nu poate fi mai mare de 2 ani');
  }
  
  return true;
}

// Exportă pentru utilizare în module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ANALYTICS_DASHBOARD_QUERY,
    AnalyticsDashboard,
    processAnalyticsData,
    validateDateRange,
    fetchAnalyticsDashboard
  };
}

// Pentru browser
if (typeof window !== 'undefined') {
  window.AnalyticsAPI = {
    ANALYTICS_DASHBOARD_QUERY,
    AnalyticsDashboard,
    processAnalyticsData,
    validateDateRange,
    fetchAnalyticsDashboard
  };
}
