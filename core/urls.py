from django.contrib import admin
from django.urls import path, include
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('organizations.urls')),
    # Serve the frontend for all routes
    path('', ensure_csrf_cookie(TemplateView.as_view(template_name='index.html'))),
    path('login/', ensure_csrf_cookie(TemplateView.as_view(template_name='index.html'))),
    path('dashboard/', ensure_csrf_cookie(TemplateView.as_view(template_name='index.html'))),
    path('planning/', ensure_csrf_cookie(TemplateView.as_view(template_name='index.html'))),
    # Catch all other routes and serve the frontend
    path('<path:path>', ensure_csrf_cookie(TemplateView.as_view(template_name='index.html'))),
]

# Serve media files in development
if settings.DEBUG or True:  # Always serve media files
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)




admin.site.site_title = "የጤና ሚኒስቴር "  # Text in the browser tab
admin.site.site_header = "የጤና  ሚኒስቴር ሁለገብ እቅድ፣ ክትትል እና ግምገማ መተግበሪያ " # Main header on admin pages
admin.site.index_title = "WELCOME ! " # Title on the admin index page 