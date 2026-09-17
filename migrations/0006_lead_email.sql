-- Adiciona o campo de e-mail aos leads (formulário do site passou a exigi-lo).
ALTER TABLE leads ADD COLUMN email TEXT;
