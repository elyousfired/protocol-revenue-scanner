const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf-8');

// 1. Modify HTML layout
html = html.replace(
  /<!-- Category Horizontal Volume Comparison Bars -->\s*<div class="pt-2 space-y-2\.5" id="bybit-categories-bars">\s*<!-- Injected via JS -->\s*<\/div>/g,
  `<!-- Category Horizontal Volume & Gain Comparison Bars -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
            <!-- Category Horizontal Volume Comparison Bars -->
            <div class="space-y-3">
              <h4 class="text-sm font-bold text-slate-300 font-mono uppercase tracking-wider">24H Volume Distribution</h4>
              <div class="space-y-2.5" id="bybit-categories-bars">
                <!-- Injected via JS -->
              </div>
            </div>

            <!-- Category Horizontal Gain Comparison Bars -->
            <div class="space-y-3">
              <h4 class="text-sm font-bold text-slate-300 font-mono uppercase tracking-wider">24H Price Performance (Gain)</h4>
              <div class="space-y-2.5" id="bybit-categories-gain-bars">
                <!-- Injected via JS -->
              </div>
            </div>
          </div>`
);

// 2. Inject JS logic
const jsInsertion = `
        // Render Horizontal Category Gain Comparison Bars
        const gainBarsEl = document.getElementById('bybit-categories-gain-bars');
        if (gainBarsEl) {
          const gainCategories = [...categories].sort((a, b) => b.weightedChange24hPct - a.weightedChange24hPct);
          const maxGain = Math.max(...gainCategories.map(c => Math.abs(c.weightedChange24hPct)), 1);
          
          gainBarsEl.innerHTML = gainCategories.map((cat, idx) => {
            const absPct = Math.max(4, Math.min(100, Math.round((Math.abs(cat.weightedChange24hPct) / maxGain) * 100)));
            const isSelected = bybitActiveCategory === cat.id;
            const isPositive = cat.weightedChange24hPct >= 0;
            const barColor = isPositive ? 'from-emerald-400 via-emerald-500 to-cyan-400' : 'from-rose-500 via-rose-600 to-purple-500';
            const textColor = isPositive ? 'text-emerald-400' : 'text-rose-400';
            const sign = isPositive ? '+' : '';

            return \`
              <div onclick="setBybitCategoryFilter('\${isSelected ? 'all' : cat.id}')" class="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-900/70 cursor-pointer transition-colors font-mono text-xs \${isSelected ? 'bg-cyan-500/10 border border-cyan-500/30' : ''}">
                <div class="w-48 sm:w-56 flex items-center gap-2 flex-shrink-0 truncate">
                  <span class="text-slate-500 w-5">#\${idx + 1}</span>
                  <span>\${cat.icon}</span>
                  <span class="font-bold text-white truncate">\${cat.name}</span>
                </div>
                <div class="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden p-[1px]">
                  <div class="h-full rounded-full bg-gradient-to-r \${barColor} transition-all duration-500" style="width: \${absPct}%"></div>
                </div>
                <div class="w-20 text-right font-extrabold \${textColor} flex-shrink-0">\${sign}\${cat.weightedChange24hPct.toFixed(2)}%</div>
              </div>
            \`;
          }).join('');
        }

`;

html = html.replace(/\/\/ Render Horizontal Category Volume Comparison Bars/g, jsInsertion + '\n        // Render Horizontal Category Volume Comparison Bars');

fs.writeFileSync('public/index.html', html);
console.log('Gain bars added successfully!');
