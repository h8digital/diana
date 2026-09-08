-- Corrige o remetente da Resend para o domínio verificado (info.dianainvestimentos.com.br).
-- Só sobrescreve se ainda estiver no valor semeado por 0004; um valor definido no
-- painel pelo usuário é preservado.

UPDATE settings
SET value = 'Diana Dutra Investimentos <naoresponda@info.dianainvestimentos.com.br>'
WHERE key = 'resend_from'
	AND value IN (
		'',
		'Diana Dutra Investimentos <naoresponda@infodianainvestimentos.com.br>'
	);
