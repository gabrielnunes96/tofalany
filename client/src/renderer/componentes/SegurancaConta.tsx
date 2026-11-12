import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import type { DoisFatoresDto, InicioDoisFatoresDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

interface Props {
  api: Pick<ClienteApi, 'doisFatores' | 'iniciarDoisFatores' | 'ativarDoisFatores' | 'desativarDoisFatores'>;
  /** Copia os códigos de recuperação (área de transferência do sistema). */
  copiar?: (texto: string) => Promise<void>;
  /** QR code do endereço otpauth (trocável nos testes). */
  gerarQr?: (texto: string) => Promise<string>;
}

type Etapa = { nome: 'situacao' } | { nome: 'senha' } | { nome: 'ler'; inicio: InicioDoisFatoresDto; qr: string } | { nome: 'codigos'; codigos: string[] } | { nome: 'desligar' };

const qrPadrao = (texto: string) => QRCode.toDataURL(texto, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
/** Segredo em grupos de 4 (mais fácil de digitar à mão). */
const agrupar = (segredo: string) => segredo.match(/.{1,4}/g)?.join(' ') ?? segredo;

/**
 * Autenticação em dois fatores (opcional): liga com a senha, o QR code no app de autenticação e um código de
 * confirmação; mostra 8 códigos de recuperação uma vez. Pedida só no login.
 */
export function SegurancaConta({ api, copiar, gerarQr = qrPadrao }: Props) {
  const [situacao, setSituacao] = useState<DoisFatoresDto | null>(null);
  const [etapa, setEtapa] = useState<Etapa>({ nome: 'situacao' });
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    api
      .doisFatores()
      .then((s) => vivo && setSituacao(s))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : 'Não foi possível ver a segurança da conta.'));
    return () => {
      vivo = false;
    };
  }, [api, tentativa]);

  function voltar() {
    setEtapa({ nome: 'situacao' });
    setSenha('');
    setCodigo('');
    setErro(null);
  }

  async function agir(acao: () => Promise<void>) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  }

  const comecar = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      const inicio = await api.iniciarDoisFatores(senha);
      setSenha('');
      setEtapa({ nome: 'ler', inicio, qr: await gerarQr(inicio.otpauth) });
    });
  };
  const confirmar = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      const { codigos } = await api.ativarDoisFatores(codigo);
      setCodigo('');
      setEtapa({ nome: 'codigos', codigos });
      setSituacao({ ativo: true, codigosRestantes: codigos.length });
    });
  };
  const desligar = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      setSituacao(await api.desativarDoisFatores(senha, codigo));
      voltar();
      setAviso('Autenticação em dois fatores desligada.');
    });
  };

  return (
    <div className="seguranca-conta">
      <h2>Autenticação em dois fatores</h2>
      <p className="suave">
        Além da senha, o login pede um código do app de autenticação do seu celular (Google Authenticator, Microsoft Authenticator ou outro). É opcional e só é pedido
        quando você entra numa conta; neste computador você continua entrando direto.
      </p>
      {aviso && (
        <p className="aviso-ok" role="status">
          {aviso}
        </p>
      )}
      {!situacao && !erro && <p className="suave">Carregando…</p>}

      {situacao && etapa.nome === 'situacao' && (
        <div className="linha-botoes">
          {situacao.ativo ? (
            <>
              <span className="selo selo-ok">Ligada</span>
              <span className="suave">{situacao.codigosRestantes} códigos de recuperação sem usar</span>
              <button type="button" className="secundario" onClick={() => (setAviso(null), setEtapa({ nome: 'desligar' }))}>
                Desligar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => (setAviso(null), setEtapa({ nome: 'senha' }))}>
              Ligar a autenticação em dois fatores
            </button>
          )}
        </div>
      )}

      {etapa.nome === 'senha' && (
        <form className="perfil-form" onSubmit={comecar}>
          <label htmlFor="seg-senha">Confirme a sua senha</label>
          <input id="seg-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
          <div className="linha-botoes">
            <button type="submit" disabled={ocupado || !senha}>
              Continuar
            </button>
            <button type="button" className="secundario" onClick={voltar}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {etapa.nome === 'ler' && (
        <form className="seguranca-passos" onSubmit={confirmar}>
          <ol>
            <li>Abra o app de autenticação no celular e escolha adicionar uma conta.</li>
            <li>Leia o QR code (ou digite a chave abaixo).</li>
            <li>Digite o código de 6 dígitos que o app mostrar.</li>
          </ol>
          <div className="seguranca-qr">
            <img src={etapa.qr} alt="QR code para o app de autenticação" width={220} height={220} />
            <div>
              <span className="suave">Chave para digitar à mão</span>
              <code data-testid="segredo-2fa">{agrupar(etapa.inicio.segredo)}</code>
            </div>
          </div>
          <label htmlFor="seg-codigo">Código do app</label>
          <input
            id="seg-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoFocus
          />
          <div className="linha-botoes">
            <button type="submit" disabled={ocupado || codigo.replace(/\s/g, '').length !== 6}>
              Ligar
            </button>
            <button type="button" className="secundario" onClick={voltar}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {etapa.nome === 'codigos' && (
        <div className="seguranca-codigos">
          <p className="aviso-ok" role="status">
            Autenticação em dois fatores ligada.
          </p>
          <p>
            Guarde estes <strong>códigos de recuperação</strong> num lugar seguro. Cada um entra uma vez só, se você ficar sem o celular. Eles não aparecem de novo.
          </p>
          <ul aria-label="Códigos de recuperação">
            {etapa.codigos.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <div className="linha-botoes">
            {copiar && (
              <button type="button" className="secundario" onClick={() => void copiar(etapa.codigos.join('\n')).then(() => setAviso('Códigos copiados.'))}>
                Copiar os códigos
              </button>
            )}
            <button type="button" onClick={voltar}>
              Já guardei
            </button>
          </div>
        </div>
      )}

      {etapa.nome === 'desligar' && (
        <form className="perfil-form" onSubmit={desligar}>
          <label htmlFor="seg-senha-desligar">Senha</label>
          <input id="seg-senha-desligar" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
          <label htmlFor="seg-codigo-desligar">Código do app ou de recuperação</label>
          <input id="seg-codigo-desligar" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <div className="linha-botoes">
            <button type="submit" className="perigo" disabled={ocupado || !senha || !codigo.trim()}>
              Desligar
            </button>
            <button type="button" className="secundario" onClick={voltar}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {erro && (
        <div className="linha-botoes">
          <p className="erro" role="alert">
            {erro}
          </p>
          {!situacao && (
            <button type="button" className="secundario" onClick={() => (setErro(null), setTentativa((n) => n + 1))}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
