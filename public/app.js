<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Almoxarifado • v7.8</title>
  <link rel="stylesheet" href="style.css" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
</head>
<body class="bg-slate-50 text-slate-900">
  <header class="w-full border-b bg-white/70 backdrop-blur sticky top-0 z-10">
    <div class="max-w-7xl mx-auto flex items-center justify-between p-3">
      <div class="text-lg font-semibold">Almoxarifado • <span id="app-ver">v7.8</span></div>
      <div class="flex items-center gap-2">
        <span id="badge-role" class="badge text-white bg-slate-900">ROLE</span>
        <span id="badge-user" class="text-sm">User</span>
        <button id="btn-logout" class="btn2" type="button">Sair</button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto p-4" id="root">
    <!-- LOGIN -->
    <section id="view-login" class="min-h-[70vh] grid place-items-center">
      <div class="bg-white rounded-2xl shadow w-full max-w-md p-6">
        <h1 class="text-2xl font-semibold mb-2">Almoxarifado • Login</h1>
        <p class="text-sm text-slate-500 mb-4">Use <b>admin/admin</b>, <b>almox/almox</b> ou <b>sol/sol</b>.</p>
        <div class="space-y-3">
          <div><label class="text-sm">Usuário</label><input id="login-user" class="inp" autocomplete="username"></div>
          <div><label class="text-sm">Senha</label><input id="login-pass" type="password" class="inp" autocomplete="current-password"></div>
          <div id="login-err" class="text-red-600 text-sm hidden">Usuário ou senha inválidos.</div>
          <button id="btn-login" class="btn w-full" type="button">Entrar</button>
          <button id="btn-wipe" class="btn2 w-full" type="button">Limpar dados (LocalStorage)</button>
        </div>
      </div>
    </section>

    <!-- APP -->
    <section id="view-app" class="hidden">
      <!-- NAV -->
      <nav class="navbar mb-4">
        <button class="tab navbtn" data-t="tab-itens" type="button">Itens</button>
        <button class="tab navbtn" data-t="tab-cad" type="button">Cadastrar</button>
        <button class="tab navbtn" data-t="tab-sol" type="button">Solicitações</button>
        <button class="tab navbtn" data-t="tab-almox" type="button">Almoxarife</button>
        <button class="tab navbtn" data-t="tab-res" type="button">Resumo</button>
        <button class="tab navbtn" data-t="tab-users" type="button">Usuários</button>
      </nav>

      <!-- ITENS -->
      <section id="tab-itens" class="card hidden">
        <div class="flex items-center justify-between mb-3">
          <input id="itens-q" class="inp max-w-md" placeholder="Buscar insumo/código/unidade">
          <div class="text-xs text-slate-500">* Caixa fica vermelha quando estoque &lt; mínimo.</div>
        </div>
        <div id="itens-list" class="grid md:grid-cols-2 lg:grid-cols-3 gap-3"></div>
        <div id="itens-empty" class="muted hidden">Nenhum item.</div>
      </section>

      <!-- CADASTRO -->
      <section id="tab-cad" class="card hidden">
        <h2 class="title">Cadastrar Insumo</h2>
        <form id="cad-form" class="grid md:grid-cols-2 gap-3">
          <div class="md:col-span-2"><label class="text-sm">Nome Insumo</label><input name="name" class="inp" required></div>
          <div><label class="text-sm">Cód. Material</label><input name="code" class="inp"></div>
          <div><label class="text-sm">Unidade</label><input name="unit" class="inp" placeholder="ex: un, cx, kg, m"></div>
          <div class="md:col-span-2"><label class="text-sm">Inserir Foto</label><input name="image" type="file" accept="image/*" class="inp"></div>
          <div class="md:col-span-2 flex justify-end"><button class="btn" type="submit">Cadastrar</button></div>
        </form>
      </section>

      <!-- SOLICITAÇÕES -->
      <section id="tab-sol" class="card hidden">
        <div class="grid lg:grid-cols-3 gap-4">
          <div>
            <h2 class="title">Nova Solicitação</h2>
            <div class="space-y-3 mb-3">
              <input id="s-pedido" class="inp" placeholder="Pedido (ex: 2025-0001)">
              <input id="s-linha" class="inp" placeholder="Linha">
              <input id="s-forn" class="inp" placeholder="Fornecedor">
              <input id="s-marca" class="inp" placeholder="Marca">
            </div>
            <div class="box">
              <label class="text-sm">Nome Insumo</label>
              <select id="s-item" class="inp"></select>
              <div class="grid grid-cols-3 gap-2 text-sm mt-2">
                <input id="s-code" class="inp" readonly>
                <input id="s-unit" class="inp" readonly>
                <input id="s-stock" class="inp" readonly>
              </div>
              <div id="s-photo" class="text-xs text-slate-500 mt-2">Sem foto</div>
              <div class="grid grid-cols-3 gap-2 mt-2">
                <input id="s-qt" type="number" min="1" value="1" class="inp">
                <input id="s-vu" type="number" min="0" step="0.01" value="0" class="inp">
                <input id="s-total" class="inp" readonly>
              </div>
              <button id="s-add" class="btn w-full mt-2" type="button">Adicionar material</button>
            </div>
          </div>
          <div class="lg:col-span-2">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold mb-2">Materiais adicionados</h3>
              <button id="s-pdf" class="btn2" type="button">Baixar PDF (rascunho)</button>
            </div>
            <div id="s-list" class="space-y-3"></div>
            <div id="s-empty" class="muted">Nenhum material.</div>
            <div class="flex justify-end mt-3"><button id="s-save" class="btn" type="button">Salvar solicitação</button></div>
            <hr class="my-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Minhas solicitações</h3>
              <input id="s-q" class="inp text-sm" placeholder="Buscar por pedido/fornecedor/marca">
            </div>
            <div id="s-me" class="space-y-3"></div>
            <div id="s-me-empty" class="muted hidden">Nenhuma solicitação.</div>
            <div class="flex justify-end mt-3"><button id="s-pdf-all" class="btn2" type="button">Baixar PDF (todas)</button></div>
          </div>
        </div>
      </section>

      <!-- ALMOX -->
      <section id="tab-almox" class="card hidden">
        <div class="grid lg:grid-cols-3 gap-4">
          <div>
            <h2 class="title">Calendário</h2>
            <div class="flex items-center gap-2 mb-2">
              <button id="c-prev" class="btn2" type="button">&larr;</button>
              <div id="c-title" class="font-semibold"></div>
              <button id="c-next" class="btn2" type="button">&rarr;</button>
            </div>
            <table class="calendar w-full border text-sm">
              <thead><tr class="text-slate-500"><th>Dom</th><th>Seg</th><th>Ter</th><th>Qua</th><th>Qui</th><th>Sex</th><th>Sáb</th></tr></thead>
              <tbody id="c-body"></tbody>
            </table>
            <div class="text-xs mt-2 flex items-center gap-4">
              <span><span class="dot bg-red-600"></span> Pendente</span>
              <span><span class="dot bg-amber-600"></span> Parcial</span>
              <span><span class="dot bg-green-600"></span> Concluído</span>
            </div>
            <div id="c-day" class="mt-3 text-sm"></div>
          </div>
          <div class="lg:col-span-2">
            <h2 class="title">Acompanhar Solicitações</h2>
            <div id="a-list" class="space-y-3"></div>
            <div id="a-empty" class="muted">Nenhuma solicitação pendente.</div>
          </div>
        </div>
      </section>

      <!-- RESUMO -->
      <section id="tab-res" class="card hidden">
        <div class="flex items-center justify-between mb-2">
          <h2 class="title">Resumo</h2>
          <div class="flex items-center gap-2">
            <input id="r-q" class="inp text-sm w-64" placeholder="Buscar (pedido/fornecedor/marca)">
            <button id="r-pdf" class="btn2" type="button">Baixar PDF Geral</button>
          </div>
        </div>
        <div class="text-xs mb-3 flex items-center gap-4">
          <span><span class="pill pill-red">PENDENTE</span></span>
          <span><span class="pill pill-amber">PARCIAL</span></span>
          <span><span class="pill pill-green">CONCLUÍDO</span></span>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">
          <div>
            <h3 class="font-semibold mb-2">Pendentes / Parciais</h3>
            <div id="r-pend" class="space-y-2"></div>
            <div id="r-pend-empty" class="muted">Nenhuma pendência.</div>
          </div>
          <div>
            <h3 class="font-semibold mb-2">Concluídas</h3>
            <div id="r-done" class="space-y-2"></div>
            <div id="r-done-empty" class="muted">Nada concluído ainda.</div>
          </div>
        </div>
        <hr class="my-6">
        <h3 class="font-semibold mb-2">Totais por Item</h3>
        <div id="r-tot" class="space-y-1 text-sm"></div>
      </section>

      <!-- USERS -->
      <section id="tab-users" class="card hidden">
        <div class="grid lg:grid-cols-3 gap-4">
          <div>
            <h2 class="title">Novo Usuário</h2>
            <input id="u-name" class="inp" placeholder="Nome">
            <input id="u-username" class="inp" placeholder="Usuário">
            <input id="u-password" type="password" class="inp" placeholder="Senha">
            <select id="u-role" class="inp">
              <option value="ADMIN">ADMIN</option>
              <option value="ALMOX">ALMOX</option>
              <option value="SOLICITANTE" selected>SOLICITANTE</option>
            </select>
            <button id="u-create" class="btn mt-2" type="button">Cadastrar</button>
            <div class="text-xs text-slate-500 mt-3">Logins padrão: <b>admin/admin</b>, <b>almox/almox</b>, <b>sol/sol</b>.</div>
          </div>
          <div class="lg:col-span-2">
            <div id="u-list" class="space-y-2"></div>
            <div id="u-empty" class="muted hidden">Nenhum usuário.</div>
          </div>
        </div>
      </section>
    </section>
  </main>

  <script defer src="app.js"></script>
</body>
</html>
