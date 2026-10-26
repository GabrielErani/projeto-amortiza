import { periodoCurto, rotuloDia } from '../../src/components/rotulos';
import { gerarEstruturaSemana } from '../../src/utils/datas';

// Semana de 19 a 25/10/2026, hoje = quarta (21).
const SEMANA = gerarEstruturaSemana(new Date(2026, 9, 21));

describe('rotuloDia', () => {
  it('encurta o dia da semana e a data ("Segunda, 19 out")', () => {
    expect(SEMANA.map(rotuloDia)).toEqual([
      'Segunda, 19 out',
      'Terça, 20 out',
      'Quarta, 21 out · hoje',
      'Quinta, 22 out',
      'Sexta, 23 out',
      'Sábado, 24 out',
      'Domingo, 25 out',
    ]);
  });

  it('marca "· hoje" só no dia atual', () => {
    expect(SEMANA.filter((d) => rotuloDia(d).endsWith(' · hoje'))).toEqual([SEMANA[2]]);
  });

  it('funciona com o rótulo completo vindo de qualquer mês', () => {
    const [segunda] = gerarEstruturaSemana(new Date(2026, 0, 7)); // semana de 5 a 11 de janeiro de 2026
    expect(rotuloDia({ ...segunda, isHoje: false })).toBe('Segunda, 5 jan');
  });
});

describe('periodoCurto', () => {
  it('semana dentro do mês: "19 – 25 out"', () => {
    expect(periodoCurto(SEMANA)).toBe('19 – 25 out');
  });

  it('semana que cruza o mês mostra os dois meses: "28 set – 4 out"', () => {
    expect(periodoCurto(gerarEstruturaSemana(new Date(2026, 9, 1)))).toBe('28 set – 4 out');
  });

  it('semana que cruza o ano: "29 dez – 4 jan"', () => {
    expect(periodoCurto(gerarEstruturaSemana(new Date(2025, 11, 31)))).toBe('29 dez – 4 jan');
  });

  it('sem os 7 dias, não inventa período', () => {
    expect(periodoCurto([])).toBe('');
    expect(periodoCurto(SEMANA.slice(0, 6))).toBe('');
  });
});
