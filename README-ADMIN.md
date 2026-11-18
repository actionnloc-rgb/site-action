# Guia de Configuração — Painel Administrativo ACTION Film Equipment

Este documento explica passo a passo como ativar o banco de dados (Firebase Firestore), o login administrativo (Firebase Authentication) e o envio de fotos (Cloudinary) sem precisar de servidor próprio.

> Enquanto o Firebase não estiver configurado, o catálogo estático continua funcionando normalmente no site público, **mas o envio do formulário de orçamento exibe aviso de erro/configuração pendente e não conclui sem gravar o pedido**. Em `localhost`, há um modo de teste local automático em `localStorage`; fora de `localhost`, o painel `admin.html` permanece bloqueado até a configuração ser feita.

---

## 1. Criar o projeto no Firebase

1. Acesse [https://console.firebase.google.com/](https://console.firebase.google.com/) e faça login com sua conta Google.
2. Clique em **Adicionar projeto** (ex.: `action-film-equipment`) e conclua o assistente.
3. Na tela inicial do projeto, clique no ícone da Web (`</>`) para registrar um aplicativo Web:
   - Informe um apelido (ex.: `Site ACTION`).
   - Não é necessário marcar o Firebase Hosting se for hospedar em outro lugar.
   - Copie o objeto `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) — você vai colocá-lo nas variáveis do `.env` na etapa 7.

---

## 2. Ativar o Firestore Database

1. No menu lateral esquerdo do Firebase Console, acesse **Criação → Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha uma região próxima (ex.: `southamerica-east1` — São Paulo).
4. Inicie em **modo de produção** (as regras finais serão publicadas na etapa 5).

---

## 3. Ativar Authentication (E-mail/Senha) e criar o usuário administrador

1. No menu lateral esquerdo, acesse **Criação → Authentication**.
2. Clique em **Vamos começar**.
3. Na aba **Sign-in method**, clique em **E-mail/senha**, ative a opção **E-mail/senha** (deixe "Link de e-mail" desativado) e salve.
4. Vá para a aba **Users** e clique em **Adicionar usuário**.
5. Informe o e-mail e a senha de quem vai administrar o site e clique em **Adicionar usuário**.
6. Na lista de usuários criada, copie o **UID do usuário** (coluna *User UID*).

> Não existe tela pública de cadastro: apenas usuários criados por você no Console podem entrar no painel.

---

## 4. Cadastrar o documento `admins/{uid}` no Firestore

Por segurança, não basta existir uma conta no Authentication: o painel e as regras do Firestore exigem que o `UID` esteja listado na coleção `admins`.

1. No menu lateral, volte para **Firestore Database** → aba **Dados**.
2. Clique em **Iniciar coleção**.
3. Em **ID da coleção**, digite exatamente: `admins` e clique em **Avançar**.
4. Em **ID do documento**, cole o **UID do usuário** copiado na etapa 3.
5. Adicione um campo qualquer para identificar o admin, por exemplo:
   - Campo: `email` | Tipo: `string` | Valor: `seuemail@exemplo.com`
   - Campo: `role` | Tipo: `string` | Valor: `admin`
6. Clique em **Salvar**.

Repita os passos 3 e 4 para cada pessoa adicional que precisar acessar o painel.

---

## 5. Publicar as regras de segurança (`firestore.rules`)

1. No **Firestore Database**, abra a aba **Regras**.
2. Abra o arquivo `firestore.rules` deste projeto, copie **todo** o conteúdo e cole no editor do Firebase Console, substituindo o texto padrão.
3. Clique em **Publicar**.

O que essas regras garantem:
- Visitantes sem login só leem itens marcados como **Visível no site** (`published == true`), categorias e `meta`.
- Visitantes sem login não conseguem ler a lista de `leads` (clientes) nem itens ocultos.
- Visitantes só podem **criar** um novo lead se todos os campos forem válidos (tamanhos máximos, telefone E.164 com `55`, `status == "novo"`, `origem == "site"`).
- Somente usuários autenticados com documento em `admins/{uid}` podem criar, editar, reordenar ou excluir equipamentos, serviços, projetos, classificações e leads.

---

## 6. Configurar o Cloudinary e criar o Upload Preset Unsigned

O envio de fotos acontece diretamente do navegador para o Cloudinary usando um **Upload Preset não assinado (unsigned)** — nenhuma chave secreta (`API Secret`) deve ser colocada no site.

1. Crie ou acesse sua conta em [https://cloudinary.com/](https://cloudinary.com/).
2. No **Dashboard**, anote o seu **Cloud name**.
3. Acesse **Settings (engrenagem) → Upload → Upload presets** e clique em **Add upload preset**.
4. Configure o preset:
   - **Upload preset name**: escolha um nome fácil (ex.: `action_site_unsigned`).
   - **Signing mode**: selecione **Unsigned**.
   - **Folder** (opcional, recomendado): `action` (o painel envia dentro de `action/equipamentos`, `action/servicos` e `action/projetos`).
   - **Allowed formats**: restrinja para `jpg, png, webp` (na aba *Upload Manipulations* / *Allowed formats* ou nas configurações do preset).
   - **Max file size**: limite para `10485760` bytes (10 MB) se desejar reforçar no servidor do Cloudinary também.
5. Salve o preset e anote o nome dele.

> **Sobre exclusão de fotos:** ao remover uma foto dentro do painel administrativo, apenas a referência dela é removida do Firestore (ela deixa de aparecer no site). Apagar o arquivo físico no Cloudinary exige assinatura com API Secret no servidor, por isso, se quiser liberar espaço definitivamente, apague também pela **Media Library** do Cloudinary.

---

## 7. Configurar as credenciais e publicar (dois modos)

Você pode publicar o site de duas formas, dependendo da sua hospedagem:

### Modo A: Vercel ou Node.js com variáveis de ambiente (recomendado)

1. Localmente, copie `.env.example` para `.env` na raiz do projeto e preencha as variáveis abaixo:

```dotenv
FIREBASE_API_KEY=SUA_API_KEY
FIREBASE_AUTH_DOMAIN=SEU_PROJETO.firebaseapp.com
FIREBASE_PROJECT_ID=SEU_PROJETO
FIREBASE_STORAGE_BUCKET=SEU_PROJETO.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=SEU_SENDER_ID
FIREBASE_APP_ID=SEU_APP_ID
FIREBASE_MEASUREMENT_ID=SEU_MEASUREMENT_ID

CLOUDINARY_CLOUD_NAME=SEU_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET=SEU_UPLOAD_PRESET_UNSIGNED

WHATSAPP_NUMBER=5521999999999
PHONE_DISPLAY=(21) 99999-9999
INSTAGRAM_URL=https://www.instagram.com/actionn.film/
```

2. Para testar localmente, execute `npm install` e `npm run dev`. O servidor carrega o `.env` e serve `/api/site-config.js`.
3. Para publicar na Vercel:
   - Importe o repositório na Vercel com a raiz do projeto como **Root Directory**.
   - Em **Settings → Environment Variables**, cadastre as variáveis do `.env.example`.
   - Habilite para os ambientes desejados (**Production**, **Preview** e/ou **Development**) e faça o deploy.
   - O arquivo `.env` local é ignorado pelo Git. A configuração pública é servida pela função `/api/site-config.js`, e os arquivos em `public/` são servidos pela CDN da Vercel.

### Modo B: Hospedagem estática comum (sem Node/Vercel)

Se a sua hospedagem serve apenas arquivos estáticos (sem a rota `/api/site-config.js`):

1. Abra o arquivo `public/site-config.js` e substitua os valores `COLE_AQUI` pelas suas credenciais do Firebase, Cloudinary e telefone da empresa.
2. Envie **todo o conteúdo da pasta `public/`** para a raiz do seu servidor/hospedagem (a requisição para `/api/site-config.js` dará 404 na rede, mas o site usará normalmente o `site-config.js` carregado antes dele, sem erros).

> **Segurança das chaves:** `apiKey` e `appId` do Firebase são identificadores públicos do projeto Web por design (visíveis no navegador de qualquer app Firebase). A proteção real dos dados e do painel vem das **regras de segurança do Firestore (`firestore.rules`)**, do login via **Firebase Authentication** e da lista **`admins/{uid}`**. Nunca coloque `CLOUDINARY_API_SECRET`, chaves de serviço ou `GEMINI_API_KEY` em variáveis públicas nem em `public/site-config.js`.

---

## 8. Como trocar o telefone da empresa depois

As variáveis `WHATSAPP_NUMBER` e `PHONE_DISPLAY` definem o telefone comercial usado no rodapé e no botão "Enviar pelo WhatsApp":

1. Localmente, altere as variáveis correspondentes no `.env`; na Vercel, altere-as em **Settings → Environment Variables**.
2. Defina `WHATSAPP_NUMBER` somente com dígitos (`55` + DDD + número, ex.: `5521988887777`).
3. Defina `PHONE_DISPLAY` no formato de exibição desejado (ex.: `(21) 98888-7777`).
4. Faça um novo deploy para aplicar as variáveis na Vercel.

---

## 9. Importar o conteúdo atual do site no primeiro acesso

1. Acesse `admin.html` (ou clique no link discreto **Admin** no canto inferior direito do rodapé).
2. Entre com o e-mail e a senha cadastrados na etapa 3.
3. No topo do painel aparecerá o aviso com o botão **Importar conteúdo atual do site**.
4. Clique nele uma única vez: o painel criará automaticamente as 3 classificações iniciais (`Iluminação COB`, `Painéis e LEDs`, `Grip`), os 6 equipamentos, os 3 serviços e os 4 projetos atuais no Firestore e gravará `meta/migration.done = true`.
5. A partir desse momento, o site público passará a exibir os dados diretamente do Firestore.