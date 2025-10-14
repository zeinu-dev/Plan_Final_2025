from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0023_subactivitybudgetutilization'),
    ]

    operations = [
        migrations.AlterField(
            model_name='performanceachievement',
            name='achievement',
            field=models.DecimalField(decimal_places=2, help_text='Actual achievement for the reporting period', max_digits=15),
        ),
        migrations.AlterField(
            model_name='activityachievement',
            name='achievement',
            field=models.DecimalField(decimal_places=2, help_text='Actual achievement for the reporting period', max_digits=15),
        ),
    ]
