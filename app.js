/**
 * PatrimonioMC - Vanilla JS Quantitative Architecture
 * (Reescrito para máxima robustez y prevención de errores en horizontes largos)
 */

// --- UTILS & MATH ---
class MathUtils {
    static currentSeed = 42;
    static setSeed(seed) { this.currentSeed = seed; }
    
    static seededRandom() {
        this.currentSeed = (this.currentSeed * 9301 + 49297) % 233280;
        return this.currentSeed / 233280;
    }
    
    static randomNormal() {
        let u = 0, v = 0;
        while(u === 0) u = this.seededRandom();
        while(v === 0) v = this.seededRandom();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    static formatCurrency(val) { 
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val); 
    }
    
    static formatPct(val) { 
        return val.toFixed(2) + '%'; 
    }
}

// --- DETERMINISTIC ENGINE ---
class DeterministicEngine {
    static calculate(params) {
        const { cap, contrib, horizon, inf, rates } = params;
        const months = Math.max(1, horizon * 12);
        const inflationMonthly = Math.pow(1 + inf, 1/12) - 1;
        
        let results = {
            monthlyData: [], yearlyData: [],
            finalNominal: { cons: 0, fixed: 0, growth: 0 },
            finalReal: { cons: 0, fixed: 0, growth: 0 }
        };

        let balances = { cons: cap, fixed: cap, growth: cap };
        let totalInvested = cap;

        for (let m = 1; m <= months; m++) {
            balances.cons = balances.cons * (1 + rates.cons/12) + contrib;
            balances.fixed = balances.fixed * (1 + rates.fixed/12) + contrib;
            balances.growth = balances.growth * (1 + rates.growth/12) + contrib;
            totalInvested += contrib;
            
            let deflator = Math.pow(1 + inflationMonthly, m);
            results.monthlyData.push({
                month: m,
                nominal: { ...balances },
                real: {
                    cons: balances.cons / deflator,
                    fixed: balances.fixed / deflator,
                    growth: balances.growth / deflator
                }
            });

            if (m % 12 === 0) {
                results.yearlyData.push({
                    year: m/12, invested: totalInvested,
                    realCons: balances.cons / deflator,
                    realFixed: balances.fixed / deflator,
                    realGrowth: balances.growth / deflator
                });
            }
        }
        
        const finalDeflator = Math.pow(1 + inflationMonthly, months);
        results.finalNominal = { ...balances };
        results.finalReal = {
            cons: balances.cons / finalDeflator,
            fixed: balances.fixed / finalDeflator,
            growth: balances.growth / finalDeflator
        };
        return results;
    }
}

// --- MONTE CARLO ENGINE ---
class MonteCarloEngine {
    static simulate(params, iterations = 5000, seed = 42) {
        MathUtils.setSeed(seed);
        const { cap, contrib, horizon, inf, vol, targetReal, riskMiss, rates } = params;
        const months = Math.max(1, horizon * 12);
        const rateMean = rates.fixed; 
        const monthlyVol = vol / Math.sqrt(12);
        
        const targetNominal = targetReal * Math.pow(1 + inf, horizon);
        
        let finalBalances = [];
        let samplePaths = []; 
        let successCount = 0;

        for (let i = 0; i < iterations; i++) {
            let balance = cap;
            let path = [cap];
            
            for (let m = 1; m <= months; m++) {
                let actualContrib = (MathUtils.seededRandom() * 100 > riskMiss) ? contrib : 0;
                let r = rateMean/12 + MathUtils.randomNormal() * monthlyVol;
                balance = balance * (1 + r) + actualContrib;
                
                if (i < 15) path.push(balance); 
            }
            
            finalBalances.push(balance);
            if (i < 15) samplePaths.push(path);
            if (balance >= targetNominal) successCount++;
        }

        finalBalances.sort((a, b) => a - b);
        const successProb = (successCount / iterations) * 100;
        
        return {
            probSuccess: successProb,
            p10: finalBalances[Math.floor(iterations * 0.10)] || 0,
            p50: finalBalances[Math.floor(iterations * 0.50)] || 0,
            p90: finalBalances[Math.floor(iterations * 0.90)] || 0,
            samplePaths: samplePaths,
            targetNominal: targetNominal
        };
    }

    static findRequiredContribution(params, targetSuccess = 90) {
        let low = params.contrib;
        let high = params.contrib > 0 ? params.contrib * 2 : 1000;
        
        // 1. Encontrar un límite superior seguro exponencialmente (previene fallos en horizontes largos)
        for(let limit = 0; limit < 15; limit++) {
            let sim = this.simulate({ ...params, contrib: high }, 500, 99);
            if (sim.probSuccess >= targetSuccess) break;
            high *= 2;
        }

        let bestContrib = high;
        
        // 2. Búsqueda binaria refinada
        for (let i = 0; i < 15; i++) {
            let mid = (low + high) / 2;
            let sim = this.simulate({ ...params, contrib: mid }, 500, 99); 
            
            if (sim.probSuccess >= targetSuccess) {
                bestContrib = mid;
                high = mid; 
            } else {
                low = mid;
            }
        }
        return bestContrib;
    }
}

// --- CANVAS RENDERER ---
class FanChartRenderer {
    static drawDeterministic(canvas, data, horizon) {
        if (!canvas || !canvas.parentElement) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.parentElement.clientWidth;
        const H = canvas.parentElement.clientHeight;
        
        // Prevención de error si el contenedor está oculto (0x0)
        if (W === 0 || H === 0) return;
        
        canvas.width = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);
        
        const padding = 40;
        const maxVal = Math.max(...data.monthlyData.map(d => d.real.growth), 1); // Evitar div 0
        
        const getX = (m) => padding + (m / (horizon * 12)) * (W - padding * 2);
        const getY = (val) => H - padding - (val / maxVal) * (H - padding * 2);

        const drawLine = (key, color) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.moveTo(getX(0), getY(data.monthlyData[0].real[key]));
            data.monthlyData.forEach(d => ctx.lineTo(getX(d.month), getY(d.real[key])));
            ctx.stroke();
        };

        drawLine('cons', '#64748b');
        drawLine('fixed', '#3b82f6');
        drawLine('growth', '#10b981');
    }

    static drawMonteCarlo(canvas, mcData, horizon) {
        if (!canvas || !canvas.parentElement) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.parentElement.clientWidth;
        const H = canvas.parentElement.clientHeight;
        
        if (W === 0 || H === 0) return;
        
        canvas.width = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);
        
        const padding = 40;
        const months = Math.max(1, horizon * 12);
        const maxVal = Math.max(mcData.p90, mcData.targetNominal, 1) * 1.1; 
        
        const getX = (m) => padding + (m / months) * (W - padding * 2);
        const getY = (val) => H - padding - (val / maxVal) * (H - padding * 2);

        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        mcData.samplePaths.forEach(path => {
            ctx.beginPath();
            ctx.moveTo(getX(0), getY(path[0]));
            path.forEach((val, m) => ctx.lineTo(getX(m), getY(val)));
            ctx.stroke();
        });

        ctx.beginPath();
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([5, 5]);
        ctx.moveTo(getX(0), getY(mcData.targetNominal));
        ctx.lineTo(getX(months), getY(mcData.targetNominal));
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// --- UI CONTROLLER ---
class UIController {
    constructor() {
        this.form = document.getElementById('params-form');
        this.bindEvents();
        this.lastState = null;
        // Esperar un frame para asegurar que el DOM esté pintado antes de simular
        requestAnimationFrame(() => this.runSimulation()); 
    }

    getParams() {
        const p = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || 0 : 0;
        };
        return {
            cap: p('capital'), contrib: p('monthly-contrib'), targetReal: p('target'),
            horizon: p('horizon'), inf: p('inflation') / 100,
            vol: p('volatility') / 100, riskMiss: p('risk-miss'),
            rates: { cons: p('rate-cons')/100, fixed: p('rate-fixed')/100, growth: p('rate-growth')/100 }
        };
    }

    bindEvents() {
        if(this.form) {
            this.form.addEventListener('submit', (e) => { 
                e.preventDefault(); 
                this.runSimulation(); 
            });
        }
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                
                const targetPane = document.getElementById(e.target.dataset.target);
                if(targetPane) targetPane.classList.add('active');
                
                if(this.lastState) {
                    // Timeout para permitir que el display:block se aplique en el DOM
                    setTimeout(() => {
                        FanChartRenderer.drawDeterministic(document.getElementById('canvas-deterministic'), this.lastState.det, this.lastState.params.horizon);
                        FanChartRenderer.drawMonteCarlo(document.getElementById('canvas-montecarlo'), this.lastState.mc, this.lastState.params.horizon);
                    }, 50);
                }
            });
        });

        const presets = {
            'emergency': { cap: 5000, contrib: 1000, target: 30000, horizon: 2, inf: 4.5, vol: 2.0, risk: 2 },
            'auto': { cap: 10000, contrib: 2000, target: 150000, horizon: 5, inf: 4.0, vol: 10.0, risk: 5 },
            'wealth': { cap: 50000, contrib: 5000, target: 2000000, horizon: 15, inf: 4.0, vol: 15.0, risk: 10 }
        };
        
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevenir submit accidental si el botón está en un form
                const ps = presets[btn.dataset.preset];
                if(!ps) return;
                
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if(el) el.value = val;
                };
                
                setVal('capital', ps.cap);
                setVal('monthly-contrib', ps.contrib);
                setVal('target', ps.target);
                setVal('horizon', ps.horizon);
                setVal('inflation', ps.inf);
                setVal('volatility', ps.vol);
                setVal('risk-miss', ps.risk);
                
                this.runSimulation();
            });
        });

        const btnJson = document.getElementById('export-json');
        if(btnJson) btnJson.addEventListener('click', () => this.exportJSON());
        
        const btnCsv = document.getElementById('export-csv');
        if(btnCsv) btnCsv.addEventListener('click', () => this.exportCSV());
    }

    runSimulation() {
        try {
            const params = this.getParams();
            const detData = DeterministicEngine.calculate(params);
            const mcData = MonteCarloEngine.simulate(params, 5000, 42); 
            
            this.lastState = { params, det: detData, mc: mcData };
            
            this.updateUIDeterministic(detData);
            this.updateUIMonteCarlo(mcData, params);
            
            // Dibujado seguro: Si una pestaña está oculta (W=0), el renderer aborta suavemente
            FanChartRenderer.drawDeterministic(document.getElementById('canvas-deterministic'), detData, params.horizon);
            FanChartRenderer.drawMonteCarlo(document.getElementById('canvas-montecarlo'), mcData, params.horizon);
        } catch (err) {
            console.error("Error durante la simulación:", err);
        }
    }

    updateUIDeterministic(data) {
        const cont = document.getElementById('cards-deterministic');
        if(cont) {
            cont.innerHTML = ['cons', 'fixed', 'growth'].map(k => `
                <div class="card ${k}">
                    <h3>${k === 'cons' ? 'Conservador' : k === 'fixed' ? 'Renta Fija' : 'Crecimiento'}</h3>
                    <div class="val-nom">${MathUtils.formatCurrency(data.finalNominal[k])} (Nom)</div>
                    <div class="val-real">${MathUtils.formatCurrency(data.finalReal[k])} (Real)</div>
                </div>
            `).join('');
        }

        const tbody = document.querySelector('#table-deterministic tbody');
        if(tbody) {
            tbody.innerHTML = data.yearlyData.map(d => `
                <tr>
                    <td>Año ${d.year}</td>
                    <td>${MathUtils.formatCurrency(d.invested)}</td>
                    <td>${MathUtils.formatCurrency(d.realCons)}</td>
                    <td>${MathUtils.formatCurrency(d.realFixed)}</td>
                    <td>${MathUtils.formatCurrency(d.realGrowth)}</td>
                </tr>
            `).join('');
        }
    }

    updateUIMonteCarlo(data, params) {
        const summary = document.getElementById('mc-summary');
        if(!summary) return;
        
        let colorClass = data.probSuccess >= 90 ? 'high' : data.probSuccess >= 60 ? 'mid' : 'low';
        
        summary.innerHTML = `
            <div class="mc-card">
                <h3>Probabilidad de Éxito</h3>
                <div class="prob ${colorClass}">${MathUtils.formatPct(data.probSuccess)}</div>
                <p>de alcanzar ${MathUtils.formatCurrency(params.targetReal)} (Real)</p>
            </div>
            <div class="mc-card">
                <h3>Percentiles Finales Nominales</h3>
                <p>P10 (Pesimista): ${MathUtils.formatCurrency(data.p10)}</p>
                <p>P50 (Mediana): ${MathUtils.formatCurrency(data.p50)}</p>
                <p>P90 (Optimista): ${MathUtils.formatCurrency(data.p90)}</p>
            </div>
        `;

        const optim = document.getElementById('mc-optimization');
        if(!optim) return;

        if (data.probSuccess < 90) {
            let reqContrib = MonteCarloEngine.findRequiredContribution(params, 90);
            optim.innerHTML = `
                <h4>💡 Recomendación Algorítmica</h4>
                <p>Tu probabilidad actual es baja. Para asegurar un <strong>90% de éxito</strong>, deberías aumentar tu aportación a aprox. <strong>${MathUtils.formatCurrency(reqContrib)} / mes</strong> (Δ +${MathUtils.formatCurrency(Math.max(0, reqContrib - params.contrib))}).</p>
            `;
        } else {
            optim.innerHTML = `<h4 style="color:var(--success)">🎯 ¡Excelente! Estás en buen camino.</h4><p>Tienes altas probabilidades matemáticas de lograr o superar tu meta.</p>`;
        }
    }

    exportJSON() {
        if(!this.lastState) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.lastState));
        const anchor = document.createElement('a');
        anchor.href = dataStr; anchor.download = "PatrimonioMC_export.json"; anchor.click();
    }

    exportCSV() {
        if(!this.lastState) return;
        let csv = "Mes,Aportado,RealConservador,RealRentaFija,RealCrecimiento\n";
        this.lastState.det.monthlyData.forEach(d => {
            csv += `${d.month},${d.nominal.cons},${d.real.cons},${d.real.fixed},${d.real.growth}\n`;
        });
        const anchor = document.createElement('a');
        anchor.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
        anchor.download = "PatrimonioMC_export.csv"; anchor.click();
    }
}

window.addEventListener('DOMContentLoaded', () => new UIController());
