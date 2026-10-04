SET search_path = atd, public;

INSERT INTO region (id, codigo, nombre) VALUES
    (1, 'loreto', 'Loreto'),
    (2, 'san_martin', 'San Martín'),
    (3, 'cusco', 'Cusco');

INSERT INTO cat_causa (id, nombre, resultado) VALUES
    (1,  'Agricultura',          'antropica'),
    (2,  'Ganadería',            'antropica'),
    (3,  'Extracción forestal',  'antropica'),
    (4,  'Extracción de fauna',  'antropica'),
    (5,  'Hidrobiológicos',      'antropica'),
    (6,  'Minería',              'antropica'),
    (7,  'Hidrocarburos',        'antropica'),
    (8,  'Turismo',              'antropica'),
    (9,  'Energía',              'antropica'),
    (10, 'Transporte',           'antropica'),
    (11, 'Ocupación humana',     'antropica'),
    (12, 'Restos arqueológicos', 'antropica'),
    (13, 'Otros',                'antropica'),
    (14, 'Natural',              'natural'),
    (15, 'Incendio antrópico',   'antropica'),
    (99, 'Falsa alerta',         'falsa');

INSERT INTO cat_fuente (id, nombre) VALUES
    (1, 'Planet'), (2, 'GLAD S2'), (3, 'PNCB Landsat'), (4, 'PeruSAT-1'), (5, 'SPOT'),
    (6, 'WorldView'), (7, 'Sentinel-1'), (8, 'Global Forest Watch'), (9, 'Sentinel-2'), (10, 'CBERS-4');

INSERT INTO cat_confiabilidad (id, nombre) VALUES (1, 'Alto'), (2, 'Bajo');

INSERT INTO cat_tipo_bosque (id, nombre) VALUES (1, 'Primario'), (2, 'Secundario');

INSERT INTO cat_zonificacion (codigo, nombre) VALUES
    ('PE',  'Zona de Protección Estricta'),
    ('S',   'Zona Silvestre'),
    ('REC', 'Zona de Recuperación'),
    ('HC',  'Zona Histórico Cultural'),
    ('AD',  'Zona de Aprovechamiento Directo'),
    ('UE',  'Zona de Uso Especial'),
    ('T',   'Zona de Uso Turístico y Recreativo'),
    ('No Zonificado', 'No Zonificado');
