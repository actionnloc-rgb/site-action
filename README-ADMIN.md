# Guia de Configuração — Painel Administrativo ACTION Film Equipment

Este documento explica passo a passo como ativar o banco de dados (Firebase Firestore), o login administrativo (Firebase Authentication) e o envio de fotos (Cloudinary) sem precisar de servidor próprio.

> Enquanto as variáveis do Firebase no `.env` estiverem com os valores `COLE_AQUI`, o site público continua funcionando normalmente com o conteúdo estático atual, sem erros.

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

## 7. Configurar as variáveis de ambiente

Copie `.env.example` para `.env` na raiz do projeto e preencha as variáveis abaixo com os valores do Firebase e Cloudinary:

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

O servidor carrega o `.env` e disponibiliza no navegador apenas os campos públicos necessários. Para iniciar localmente, use `npm run dev`. Em produção, configure as mesmas variáveis no painel da hospedagem.

> Nunca coloque `CLOUDINARY_API_SECRET`, senhas ou outras chaves privadas no `.env` usado pelo site ou em qualquer arquivo público. O envio direto do navegador requer um Upload Preset configurado como **Unsigned**.

### Publicar na Vercel

1. Importe o repositório na Vercel com a raiz do projeto como **Root Directory**.
2. Em **Settings → Environment Variables**, cadastre as variáveis `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`, `CLOUDINARY_CLOUD_NAME` e `CLOUDINARY_UPLOAD_PRESET`. Adicione também as variáveis de telefone e Instagram se quiser personalizá-los.
3. Habilite as variáveis para os ambientes desejados (**Production**, **Preview** e/ou **Development**) e faça um novo deploy.

O arquivo `.env` local é ignorado pelo Git e não é enviado à Vercel. A configuração pública é servida pela função `/api/site-config.js`.

As páginas, folhas de estilo, scripts e imagens do site ficam em `public/`, diretório servido pela CDN da Vercel. Mantenha os arquivos estáticos nesse diretório para evitar que sejam respondidos pela função Express.

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