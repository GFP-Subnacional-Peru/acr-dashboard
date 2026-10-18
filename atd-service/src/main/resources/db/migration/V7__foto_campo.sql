-- Varias fotos de patrulla por alerta. Los recortes Sentinel siguen siendo uno por momento.
DROP INDEX IF EXISTS atd.evidencia_alerta_tipo_uk;
CREATE UNIQUE INDEX evidencia_chip_uk ON evidencia (alerta_id, tipo)
    WHERE tipo IN ('chip_antes', 'chip_despues');
