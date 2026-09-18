<?php
/**
 * Category archive: accent-colored hero + metrics, 8/4 content grid with
 * real paginated post loop. Ports stitch-export/category-lease-desktop.html
 * (mobile chrome pattern borrowed from category-lease-mobile.html).
 */
get_header();

$onebethub_cat = get_queried_object();
$colors        = onebethub_category_colors( $onebethub_cat->name );
$en_label      = onebethub_category_en_label( $onebethub_cat->name );
$order_index   = onebethub_category_order_index( $onebethub_cat->name );

$latest_in_cat = get_posts(
	array(
		'category'       => $onebethub_cat->term_id,
		'posts_per_page' => 1,
		'post_status'    => 'publish',
		'onebethub_lang' => onebethub_current_view_lang(),
		'suppress_filters' => false, // get_posts() defaults this to true, which would silently skip onebethub_lang_where()
	)
);
$last_updated = ! empty( $latest_in_cat ) ? get_the_date( '', $latest_in_cat[0] ) : '—';
?>

<div class="max-w-content mx-auto px-4 md:px-8 py-3 text-xs text-slate-500 flex items-center gap-2">
	<a class="hover:text-slate-900 transition" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Home', 'onebethub' ); ?></a>
	<span class="text-slate-300">/</span>
	<span class="font-semibold text-slate-900"><?php echo esc_html( $onebethub_cat->name ); ?><?php echo $en_label ? ' (' . esc_html( $en_label ) . ')' : ''; ?></span>
</div>

<div class="max-w-content mx-auto px-4 md:px-8 pb-8">
	<!-- Category hero -->
	<section class="bg-white rounded-xl border border-slate-200 p-5 md:p-8 mb-8 shadow-xs">
		<div class="category-accent-rail <?php echo esc_attr( $colors['solid'] ); ?> -mt-5 md:-mt-8 -mx-5 md:-mx-8 mb-5 md:mb-6"></div>
		<div class="flex flex-col gap-6">
			<div>
				<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full <?php echo esc_attr( $colors['bg'] ); ?> border <?php echo esc_attr( $colors['border'] ); ?> <?php echo esc_attr( $colors['text'] ); ?> text-xs font-semibold mb-3">
					<span class="w-2 h-2 rounded-full <?php echo esc_attr( $colors['dot'] ); ?>"></span>
					<?php echo esc_html( sprintf( 'VERTICAL %s', str_pad( (string) $order_index, 2, '0', STR_PAD_LEFT ) ) ); ?>
				</div>
				<h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-3 flex-wrap">
					<?php echo esc_html( $onebethub_cat->name ); ?>
					<?php if ( $en_label ) : ?><span class="font-serif-headline italic font-normal text-xl md:text-2xl text-slate-500 tracking-normal"><?php echo esc_html( $en_label ); ?></span><?php endif; ?>
				</h1>
				<?php if ( $onebethub_cat->description ) : ?>
					<p class="mt-3 text-slate-600 text-sm leading-relaxed max-w-4xl"><?php echo esc_html( $onebethub_cat->description ); ?></p>
				<?php endif; ?>
			</div>

			<div class="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
				<div class="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
					<div class="text-xs font-medium text-slate-500 uppercase tracking-wider"><?php esc_html_e( '등록 리포트', 'onebethub' ); ?></div>
					<div class="mt-1 text-2xl font-bold text-slate-900"><?php echo esc_html( $onebethub_cat->count ); ?><span class="text-sm font-medium text-slate-600 ml-1"><?php esc_html_e( '건', 'onebethub' ); ?></span></div>
				</div>
				<div class="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
					<div class="text-xs font-medium text-slate-500 uppercase tracking-wider"><?php esc_html_e( '최근 업데이트', 'onebethub' ); ?></div>
					<div class="mt-1 text-2xl font-bold text-slate-900"><?php echo esc_html( $last_updated ); ?></div>
				</div>
				<div class="p-4 rounded-lg bg-slate-50 border border-slate-200/80 col-span-2 md:col-span-1">
					<div class="text-xs font-medium text-slate-500 uppercase tracking-wider"><?php esc_html_e( '카테고리 인덱스', 'onebethub' ); ?></div>
					<div class="mt-1 text-2xl font-bold <?php echo esc_attr( $colors['text'] ); ?>">0<?php echo esc_html( $order_index ); ?><span class="text-sm font-medium text-slate-600 ml-1">/05</span></div>
				</div>
			</div>
		</div>
	</section>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
		<!-- Main list -->
		<section class="lg:col-span-8 space-y-4">
			<?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
				<article class="bg-white border border-slate-200 hover:<?php echo esc_attr( $colors['border'] ); ?> rounded-xl p-5 md:p-6 transition-all duration-200 shadow-xs hover:shadow-md">
					<div class="flex items-start justify-between gap-4">
						<div class="space-y-2 max-w-2xl">
							<div class="flex flex-wrap items-center gap-2">
								<?php foreach ( get_the_category() as $cat ) : echo onebethub_category_badge( $cat, 'lg' ); endforeach; ?>
								<span class="text-xs text-slate-400">• <?php echo esc_html( get_the_date() ); ?></span>
								<span class="text-xs text-slate-400">• <?php echo esc_html( sprintf( __( '읽는 시간 %d분', 'onebethub' ), onebethub_estimated_read_minutes() ) ); ?></span>
							</div>
							<h2 class="text-lg font-bold text-slate-900 hover:text-sky-600 transition">
								<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
							</h2>
							<p class="text-xs text-slate-600 leading-relaxed line-clamp-2"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 160 ) ); ?></p>
						</div>
					</div>
					<div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
						<span class="text-slate-500"><?php the_author(); ?></span>
						<a class="inline-flex items-center gap-1 font-bold <?php echo esc_attr( $colors['text'] ); ?> hover:opacity-75 transition" href="<?php the_permalink(); ?>">
							<span><?php esc_html_e( '리포트 열람하기', 'onebethub' ); ?></span>
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
						</a>
					</div>
				</article>
			<?php endwhile; else : ?>
				<p class="py-10 text-sm text-slate-500"><?php esc_html_e( '이 카테고리에는 아직 게시된 리포트가 없습니다.', 'onebethub' ); ?></p>
			<?php endif; ?>

			<nav class="pt-6" aria-label="<?php esc_attr_e( '페이지네이션', 'onebethub' ); ?>">
				<?php
				the_posts_pagination(
					array(
						'mid_size'  => 2,
						'prev_text' => '« ' . __( '이전', 'onebethub' ),
						'next_text' => __( '다음', 'onebethub' ) . ' »',
					)
				);
				?>
			</nav>
		</section>

		<!-- Sidebar -->
		<aside class="lg:col-span-4 space-y-6">
			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4"><?php esc_html_e( '연관 카테고리 바로가기', 'onebethub' ); ?></h3>
				<div class="space-y-2">
					<?php
					foreach ( onebethub_primary_categories() as $i => $other_cat ) :
						if ( $other_cat->term_id === $onebethub_cat->term_id ) {
							continue;
						}
						$other_colors  = onebethub_category_colors( $other_cat->name );
						$other_en      = onebethub_category_en_label( $other_cat->name );
						?>
						<a class="group flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition" href="<?php echo esc_url( get_category_link( $other_cat ) ); ?>">
							<div class="flex items-center gap-2.5">
								<span class="w-6 h-6 rounded <?php echo esc_attr( $other_colors['bg'] ); ?> <?php echo esc_attr( $other_colors['text'] ); ?> text-xs font-mono font-bold flex items-center justify-center"><?php echo esc_html( str_pad( (string) onebethub_category_order_index( $other_cat->name ), 2, '0', STR_PAD_LEFT ) ); ?></span>
								<div>
									<div class="text-xs font-bold text-slate-800 group-hover:text-sky-600"><?php echo esc_html( $other_cat->name ); ?><?php echo $other_en ? ' (' . esc_html( $other_en ) . ')' : ''; ?></div>
								</div>
							</div>
							<span class="text-slate-300 group-hover:text-slate-500 font-bold">→</span>
						</a>
					<?php endforeach; ?>
				</div>
			</div>

			<div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-sm border border-slate-700">
				<div class="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider mb-2"><?php esc_html_e( 'Editorial Independence', 'onebethub' ); ?></div>
				<h4 class="text-sm font-bold text-white mb-2"><?php bloginfo( 'name' ); ?> <?php esc_html_e( '독립 심사 원칙', 'onebethub' ); ?></h4>
				<p class="text-xs text-slate-300 leading-relaxed"><?php esc_html_e( '모든 벤더 성능 지표와 리뷰는 솔루션 공급사의 스폰서십을 엄격히 배제하고 공개 데이터와 계약 구조 분석에만 기반합니다.', 'onebethub' ); ?></p>
			</div>

			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2"><?php esc_html_e( 'Executive Briefing 신청', 'onebethub' ); ?></h4>
				<p class="text-xs text-slate-500 mb-3"><?php esc_html_e( '이 카테고리의 신규 리포트 발행 시 이메일로 안내받으세요.', 'onebethub' ); ?></p>
				<form class="space-y-2" action="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>" method="post" enctype="text/plain">
					<input class="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-sky-500 focus:outline-none" placeholder="corporate@company.com" type="email" name="email" required />
					<button class="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-bold transition" type="submit"><?php esc_html_e( '구독 신청', 'onebethub' ); ?></button>
				</form>
			</div>
		</aside>
	</div>
</div>

<?php get_footer(); ?>
