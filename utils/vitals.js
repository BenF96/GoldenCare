// Simple reference ranges for adults/older adults. These are general guide values
// for flagging readings – not a medical diagnosis.
const has = (v) => v !== null && v !== undefined;

const RULES = [
  {
    field: 'bloodPressure',
    check: ({ systolic: s, diastolic: d }) => {
      if (!has(s) && !has(d)) return null;
      if ((has(s) && s >= 180) || (has(d) && d >= 120)) return ['critical', 'Blood pressure critically high'];
      if ((has(s) && s >= 140) || (has(d) && d >= 90)) return ['high', 'High blood pressure'];
      if ((has(s) && s < 90) || (has(d) && d < 60)) return ['low', 'Low blood pressure'];
      return null;
    },
  },
  {
    field: 'heartRate',
    check: ({ heartRate: v }) => {
      if (!has(v)) return null;
      if (v > 130 || v < 40) return ['critical', v > 130 ? 'Heart rate very high' : 'Heart rate very low'];
      if (v > 100) return ['high', 'High heart rate'];
      if (v < 50) return ['low', 'Low heart rate'];
      return null;
    },
  },
  {
    field: 'temperature',
    check: ({ temperature: v }) => {
      if (!has(v)) return null;
      if (v >= 39.5) return ['critical', 'High fever'];
      if (v >= 38) return ['high', 'Fever'];
      if (v < 35) return ['low', 'Low body temperature'];
      return null;
    },
  },
  {
    field: 'oxygen',
    check: ({ oxygen: v }) => {
      if (!has(v)) return null;
      if (v < 90) return ['critical', 'Very low oxygen level'];
      if (v < 94) return ['low', 'Low oxygen level'];
      return null;
    },
  },
  {
    field: 'bloodSugar',
    check: ({ bloodSugar: v }) => {
      if (!has(v)) return null;
      if (v < 54 || v >= 300) return ['critical', v < 54 ? 'Blood sugar very low' : 'Blood sugar very high'];
      if (v < 70) return ['low', 'Low blood sugar'];
      if (v > 180) return ['high', 'High blood sugar'];
      return null;
    },
  },
];

function evaluateVitals(reading) {
  return RULES.map(({ field, check }) => {
    const result = check(reading);
    return result && { field, level: result[0], message: result[1] };
  }).filter(Boolean);
}

module.exports = { evaluateVitals };
