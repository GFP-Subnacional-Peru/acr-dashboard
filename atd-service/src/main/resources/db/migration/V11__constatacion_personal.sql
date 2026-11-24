SET search_path = atd, public;

-- Quién registró la constatación de campo. La fotointerpretación no usa estas columnas.
ALTER TABLE evidencia
    ADD COLUMN autor_nombre VARCHAR(150),
    ADD COLUMN autor_cargo  VARCHAR(120);
