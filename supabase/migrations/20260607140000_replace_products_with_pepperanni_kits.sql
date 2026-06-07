/*
  # Replace catalog with PepperAnni kits

  1. Removes all existing products (variations cascade automatically).
  2. Inserts the 18 products from the PepperAnni price list.
  3. Each product gets two variations:
     - "Kit"              -> full price shown in the image
     - "Vial + Bac Water" -> kit price less PHP 200
  base_price holds the full kit price.
*/

-- 1. Remove existing catalog
DELETE FROM products;

-- 2 & 3. Insert new products and their Kit / Vial + Bac Water variations
WITH new_products AS (
  INSERT INTO products (name, description, category, base_price, purity_percentage, storage_conditions, stock_quantity, available, featured)
  VALUES
    ('TRZ 30',        'Tirzepatide 30mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1900, 99, 'Store at -20°C', 100, true, true),
    ('TRZ 15',        'Tirzepatide 15mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1500, 99, 'Store at -20°C', 100, true, true),
    ('RETA 20',       'Retatrutide 20mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1800, 99, 'Store at -20°C', 100, true, true),
    ('CAGRI 5',       'Cagrilintide 5mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1500, 99, 'Store at -20°C', 100, true, false),
    ('AOD 5',         'AOD-9604 5mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1600, 99, 'Store at -20°C', 100, true, false),
    ('5AMINO 50',     '5-Amino-1MQ 50mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1600, 99, 'Store at -20°C', 100, true, false),
    ('LCARTININE 600','L-Carnitine 600mg', 'c0a80121-0002-4e78-94f8-585d77059002', 1500, 99, 'Store at -20°C', 100, true, false),
    ('LIPO C B12',    'Lipo-C + B12', 'c0a80121-0002-4e78-94f8-585d77059002', 1600, 99, 'Store at -20°C', 100, true, false),
    ('FAT BLASTER',   'Fat Blaster blend', 'c0a80121-0002-4e78-94f8-585d77059002', 1700, 99, 'Store at -20°C', 100, true, false),
    ('GHKCU 100',     'GHK-Cu 100mg', 'c0a80121-0003-4e78-94f8-585d77059003', 1550, 99, 'Store at -20°C', 100, true, false),
    ('GLOW 70',       'Glutathione Glow 70', 'c0a80121-0003-4e78-94f8-585d77059003', 2300, 99, 'Store at -20°C', 100, true, true),
    ('KLOW 80',       'KLOW recovery blend 80', 'c0a80121-0003-4e78-94f8-585d77059003', 2400, 99, 'Store at -20°C', 100, true, true),
    ('GTT 1500',      'Glutathione 1500mg', 'c0a80121-0003-4e78-94f8-585d77059003', 1650, 99, 'Store at -20°C', 100, true, false),
    ('SEMAX 10',      'Semax 10mg', 'c0a80121-0004-4e78-94f8-585d77059004', 1500, 99, 'Store at -20°C', 100, true, false),
    ('SELANK 10',     'Selank 10mg', 'c0a80121-0004-4e78-94f8-585d77059004', 1600, 99, 'Store at -20°C', 100, true, false),
    ('KPV 10',        'KPV 10mg', 'c0a80121-0004-4e78-94f8-585d77059004', 1500, 99, 'Store at -20°C', 100, true, false),
    ('NAD 500',       'NAD+ 500mg', 'c0a80121-0004-4e78-94f8-585d77059004', 1600, 99, 'Store at -20°C', 100, true, false),
    ('MOTSC 10',      'MOTS-c 10mg', 'c0a80121-0004-4e78-94f8-585d77059004', 1300, 99, 'Store at -20°C', 100, true, false)
  RETURNING id, base_price
)
INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity)
SELECT id, 'Kit', 0, base_price, 100 FROM new_products
UNION ALL
SELECT id, 'Vial + Bac Water', 0, base_price - 200, 100 FROM new_products;
