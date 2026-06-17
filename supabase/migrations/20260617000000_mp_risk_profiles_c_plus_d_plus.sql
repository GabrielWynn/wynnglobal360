-- Extend shared risk profiles for life companies that use A, B, C, C+, D, D+

INSERT INTO mp_risk_profiles (label, name, risk_level) VALUES
  ('C+', 'Moderate Aggressive Plus', 4),
  ('D+', 'Aggressive Plus',           6)
ON CONFLICT (label) DO NOTHING;

-- Re-order D to sit between C+ and D+ when sorted by risk_level
UPDATE mp_risk_profiles SET risk_level = 5 WHERE label = 'D';
