SET search_path = atd, public;

-- El cargo del equipo del ACR es el que imprime el PDF de la alerta.
-- El correo queda en la tabla por las filas ya cargadas, y el visor deja de pedirlo.
ALTER TABLE responsable_acr
    ADD COLUMN cargo VARCHAR(120);
